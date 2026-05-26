/**
 * Session detail composable — faithful port of src/frontend/session-detail.js
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// ── Subagent utils (inlined from src/frontend/subagent-utils.js) ──

function computeSubagentOwnership(events) {
  const ownerMap = new Map();
  const subagentInfo = new Map();
  let colorIdx = 0;

  for (const ev of events) {
    if (ev.type === 'subagent.started') {
      const tcid = ev.data?.toolCallId;
      if (tcid) {
        subagentInfo.set(tcid, {
          name: ev.data?.agentDisplayName || ev.data?.agentName || 'SubAgent',
          colorIndex: colorIdx++,
          meta: {
            agentName: ev.data?.agentName || '',
            agentDisplayName: ev.data?.agentDisplayName || '',
            agentDescription: ev.data?.agentDescription || ''
          }
        });
      }
    }
  }

  for (const ev of events) {
    if (ev.type !== 'tool.execution_start') continue;
    const tcid = ev.data?.toolCallId;
    if (!tcid || !subagentInfo.has(tcid)) continue;
    const info = subagentInfo.get(tcid);
    let args = ev.data?.arguments;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch (_e) { continue; }
    }
    if (!args || typeof args !== 'object') continue;
    if (args.description) info.meta.taskDescription = args.description;
    if (args.name) info.meta.taskName = args.name;
    if (args.agent_type) info.meta.agentType = args.agent_type;
    if (args.mode) info.meta.taskMode = args.mode;
    if (args.description && info.name === (info.meta.agentDisplayName || info.meta.agentName)) {
      info.name = args.description;
    }
  }

  for (const ev of events) {
    if (ev.type === 'assistant.message' && ev.data?.subAgentName && ev.data?.subAgentId) {
      const sid = ev.data.subAgentId;
      if (!subagentInfo.has(sid)) {
        subagentInfo.set(sid, {
          name: ev.data.subAgentName,
          colorIndex: colorIdx++,
          meta: { agentName: ev.data.subAgentName }
        });
      }
      ownerMap.set(ev.stableId, sid);
    }
  }

  for (const ev of events) {
    if (ev._subagent?.id) {
      const sid = ev._subagent.id;
      if (!subagentInfo.has(sid)) {
        subagentInfo.set(sid, {
          name: ev._subagent.name || 'SubAgent',
          colorIndex: colorIdx++,
          meta: { agentName: ev._subagent.name || '' }
        });
      }
      ownerMap.set(ev.stableId, sid);
    }
  }

  if (subagentInfo.size === 0) return { ownerMap, subagentInfo };

  const idMap = new Map();
  for (const ev of events) {
    if (ev.id) idMap.set(ev.id, ev);
  }

  for (const ev of events) {
    if (ev.type === 'assistant.message') {
      const ptcid = ev.data?.parentToolCallId;
      if (ptcid && subagentInfo.has(ptcid)) {
        ownerMap.set(ev.stableId, ptcid);
      }
    }
  }

  for (const ev of events) {
    if (ev.type !== 'reasoning') continue;
    let current = ev.parentId;
    let depth = 0;
    while (current && depth < 10) {
      const parent = idMap.get(current);
      if (!parent) break;
      if (parent.type === 'assistant.message') {
        const ptcid = parent.data?.parentToolCallId;
        if (ptcid && subagentInfo.has(ptcid)) {
          ownerMap.set(ev.stableId, ptcid);
        }
        break;
      }
      current = parent.parentId;
      depth++;
    }
  }

  const startIdByToolCallId = new Map();
  for (const ev of events) {
    if (ev.type !== 'tool.execution_start') continue;
    let current = ev.parentId;
    let depth = 0;
    while (current && depth < 10) {
      const parent = idMap.get(current);
      if (!parent) break;
      if (parent.type === 'assistant.message') {
        const ptcid = parent.data?.parentToolCallId;
        if (ptcid && subagentInfo.has(ptcid)) {
          ownerMap.set(ev.stableId, ptcid);
          const tcid = ev.data?.toolCallId;
          if (tcid) startIdByToolCallId.set(tcid, ptcid);
        }
        break;
      }
      current = parent.parentId;
      depth++;
    }
  }

  for (const ev of events) {
    if (ev.type !== 'tool.execution_complete') continue;
    const tcid = ev.data?.toolCallId;
    if (tcid && startIdByToolCallId.has(tcid)) {
      ownerMap.set(ev.stableId, startIdByToolCallId.get(tcid));
    }
  }

  for (const ev of events) {
    if (ev.type !== 'tool.invocation') continue;
    const ptcid = ev.data?.parentToolCallId;
    if (ptcid && subagentInfo.has(ptcid)) {
      ownerMap.set(ev.stableId, ptcid);
    }
  }

  let activeSubagent = null;
  for (const ev of events) {
    if (ev.type === 'subagent.started' && ev.data?.toolCallId && subagentInfo.has(ev.data.toolCallId)) {
      activeSubagent = ev.data.toolCallId;
    } else if ((ev.type === 'subagent.completed' || ev.type === 'subagent.failed') && ev.data?.toolCallId === activeSubagent) {
      activeSubagent = null;
    } else if (activeSubagent && !ownerMap.has(ev.stableId)) {
      ownerMap.set(ev.stableId, activeSubagent);
    }
  }

  for (const [tcid, info] of subagentInfo) {
    for (const ev of events) {
      const owned = ownerMap.get(ev.stableId) === tcid ||
        (ev._subagent?.id === tcid) ||
        (ev.data?.subAgentId === tcid);
      if (!owned) continue;
      const model = ev.model || ev.data?.model;
      if (model) {
        info.meta.model = model;
        break;
      }
    }
  }

  return { ownerMap, subagentInfo };
}

function filterBySubagent(events, selectedSubagent, ownerMap) {
  if (!selectedSubagent) return events;
  return events.filter(e => {
    if ((e.type === 'subagent.started' || e.type === 'subagent.completed' || e.type === 'subagent.failed') && e.data?.toolCallId === selectedSubagent) return true;
    if (ownerMap.get(e.stableId) === selectedSubagent) return true;
    if (e._subagent?.id === selectedSubagent) return true;
    if (e.data?.subAgentId === selectedSubagent) return true;
    return false;
  });
}

// ── Usage utils (inlined from src/frontend/usage-utils.js) ──

function getDisplayInputTokens(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  const inputTokens = Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0;
  const cacheReadTokens = Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
  const cacheWriteTokens = Number.isFinite(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0;
  return Math.max(inputTokens - cacheReadTokens - cacheWriteTokens, 0);
}

function getUsageCacheHitRatio(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const cacheReadTokens = Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
  const totalReadableInput = getDisplayInputTokens(usage) + cacheReadTokens;
  if (cacheReadTokens === 0 || totalReadableInput === 0) return null;
  return Math.round((cacheReadTokens / totalReadableInput) * 100);
}

// ── Constants ──

const SUBAGENT_COLORS = [
  '#58a6ff', '#f0883e', '#a371f7', '#3fb950',
  '#f778ba', '#79c0ff', '#d29922', '#56d4dd'
];

const TAG_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'
];

// ── Composable ──

export function useSessionData() {
  const route = useRoute();
  const _router = useRouter();
  const sessionId = ref(route.params.id);
  const source = ref(route.params.source);
  const metadata = ref({});
  const exporting = ref(false);

  const isMobile = () => window.innerWidth <= 640;
  const sidebarCollapsed = ref(
    isMobile() ? true : localStorage.getItem('sidebarCollapsed') === 'true'
  );

  watch(sidebarCollapsed, (v) => {
    if (!isMobile()) localStorage.setItem('sidebarCollapsed', v.toString());
  });

  const expandedTools = ref({});
  const expandedContent = ref({});
  const MAX_EXPANDED_ITEMS = 50;

  const cleanupExpansionState = () => {
    const toolKeys = Object.keys(expandedTools.value);
    if (toolKeys.length > MAX_EXPANDED_ITEMS) {
      toolKeys.slice(0, toolKeys.length - MAX_EXPANDED_ITEMS).forEach(k => delete expandedTools.value[k]);
    }
    const contentKeys = Object.keys(expandedContent.value);
    if (contentKeys.length > MAX_EXPANDED_ITEMS) {
      contentKeys.slice(0, contentKeys.length - MAX_EXPANDED_ITEMS).forEach(k => delete expandedContent.value[k]);
    }
  };

  const currentFilter = ref('all');
  const searchText = ref('');
  const debouncedSearchText = ref('');
  const currentTurnIndex = ref(0);
  const scrollerRef = ref(null);
  const visibleRange = ref({ start: 0, end: 0 });
  const selectedSubagent = ref(null);
  const subagentDropdownOpen = ref(false);
  const subagentSearchQuery = ref('');
  const subagentSearchRef = ref(null);
  const typeFilterOpen = ref(false);

  const activeFilterCount = computed(() => {
    let count = 0;
    if (currentFilter.value !== 'all') count++;
    if (selectedSubagent.value) count++;
    if (searchText.value.trim()) count++;
    return count;
  });

  const clearAllFilters = () => {
    currentFilter.value = 'all';
    selectedSubagent.value = null;
    searchText.value = '';
    debouncedSearchText.value = '';
    typeFilterOpen.value = false;
  };

  let searchTimeout = null;
  let scrollCleanup = null;

  watch(searchText, (newValue) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      debouncedSearchText.value = newValue;
    }, 300);
  });

  watch(currentFilter, () => cleanupExpansionState());
  watch(debouncedSearchText, () => cleanupExpansionState());

  watch(subagentDropdownOpen, (open) => {
    if (open) nextTick(() => subagentSearchRef.value?.focus());
  });

  // Async loading
  const loadedEvents = ref([]);
  const eventsLoading = ref(true);
  const eventsError = ref(null);

  const flatEvents = computed(() => {
    return loadedEvents.value
      .filter(e => e.type !== 'assistant.turn_end' && e.type !== 'assistant.turn_complete')
      .sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return (a._fileIndex ?? 0) - (b._fileIndex ?? 0);
      })
      .map((e, index) => ({
        ...e,
        virtualIndex: index,
        stableId: e.id || `${e.timestamp}-${e.type}-${index}`
      }));
  });

  const matchesSearch = (e) => {
    if (!debouncedSearchText.value.trim()) return true;
    const search = debouncedSearchText.value.toLowerCase();
    const content = [
      e.data?.message, e.data?.text, e.data?.content, e.data?.reason,
      e.data?.reasoningText, e.data?.errorType, e.data?.previousModel, e.data?.newModel
    ].filter(Boolean).join(' ').toLowerCase();
    return content.includes(search);
  };

  const searchFilteredEvents = computed(() => {
    const excludeToolCalls = (e) => {
      const t = e.type || '';
      return t !== 'tool.execution_start' && t !== 'tool.execution_complete';
    };
    let events = flatEvents.value.filter(excludeToolCalls);
    if (debouncedSearchText.value.trim()) {
      events = events.filter(matchesSearch);
    }
    return events;
  });

  const subagentOwnership = computed(() => computeSubagentOwnership(flatEvents.value));

  const filteredEvents = computed(() => {
    let events = searchFilteredEvents.value;
    if (selectedSubagent.value) {
      const { ownerMap } = subagentOwnership.value;
      events = filterBySubagent(events, selectedSubagent.value, ownerMap);
    }
    if (currentFilter.value !== 'all') {
      events = events.filter(e => e.type === currentFilter.value);
    }
    const dividerTypes = ['assistant.turn_start', 'subagent.started', 'subagent.completed', 'subagent.failed'];
    const totalCount = events.length;
    return events.map((e, index) => {
      const nextItem = events[index + 1];
      const isLast = index === totalCount - 1;
      const nextIsDivider = nextItem && dividerTypes.includes(nextItem.type);
      return { ...e, filteredIndex: index, filteredTotal: totalCount, isLastEvent: isLast || nextIsDivider };
    });
  });

  const eventCounts = computed(() => {
    const counts = {};
    searchFilteredEvents.value.forEach(e => { if (e.type) counts[e.type] = (counts[e.type] || 0) + 1; });
    return counts;
  });

  const searchResultCount = computed(() => {
    if (!debouncedSearchText.value.trim()) return null;
    const count = searchFilteredEvents.value.length;
    return count > 0 ? `${count} result${count !== 1 ? 's' : ''}` : 'No matches';
  });

  const expansionCount = computed(() => {
    return Object.keys(expandedTools.value).filter(k => expandedTools.value[k]).length +
      Object.keys(expandedContent.value).filter(k => expandedContent.value[k]).length;
  });

  const filters = computed(() => {
    const totalEvents = searchFilteredEvents.value.length;
    const result = [{ type: 'all', label: `All (${totalEvents})`, count: totalEvents }];
    const typeCounts = {};
    searchFilteredEvents.value.forEach(e => { if (e.type) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1; });
    const sortedTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, label: `${type} (${count})`, count, disabled: false }));
    return [...result, ...sortedTypes];
  });

  const turns = computed(() => {
    const turnStarts = flatEvents.value.filter(e => e.type === 'assistant.turn_start');
    const allUserMessages = flatEvents.value.filter(e => e.type === 'user.message');
    return turnStarts.map((turn, idx) => {
      const startTime = new Date(turn.timestamp).getTime();
      let endTime;
      if (idx + 1 < turnStarts.length) {
        endTime = new Date(turnStarts[idx + 1].timestamp).getTime();
      } else {
        endTime = Date.now();
      }
      const durationMs = endTime - startTime;
      const totalSeconds = Math.floor(durationMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      const userMessage = flatEvents.value
        .slice(0, flatEvents.value.indexOf(turn))
        .reverse()
        .find(e => e.type === 'user.message');
      const userReqNumber = userMessage ? allUserMessages.indexOf(userMessage) + 1 : 0;
      return {
        id: idx,
        index: turn.virtualIndex,
        originalTurnId: turn.data?.turnId,
        timestamp: turn.timestamp,
        duration: durationText,
        message: userMessage?.data?.content || userMessage?.data?.transformedContent || '',
        userReqNumber
      };
    });
  });

  const userReqs = computed(() => {
    const groups = [];
    const reqMap = new Map();
    turns.value.forEach(turn => {
      const reqNum = turn.userReqNumber || 0;
      if (!reqMap.has(reqNum)) {
        const group = { reqNumber: reqNum, message: turn.message, turns: [] };
        reqMap.set(reqNum, group);
        groups.push(group);
      }
      reqMap.get(reqNum).turns.push(turn);
    });
    return groups;
  });

  const truncateText = (text, maxLen) => {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '…';
  };

  const subagentList = computed(() => {
    const { subagentInfo } = subagentOwnership.value;
    if (subagentInfo.size === 0) return [];
    const list = [];
    for (const [toolCallId, info] of subagentInfo) {
      list.push({ toolCallId, name: info.name, colorIndex: info.colorIndex, meta: info.meta || {} });
    }
    return list;
  });

  const filteredSubagentList = computed(() => {
    const q = subagentSearchQuery.value.toLowerCase().trim();
    if (!q) return subagentList.value;
    return subagentList.value.filter(sa => {
      const m = sa.meta || {};
      const searchable = [sa.name, m.taskName, m.taskDescription, m.agentName, m.agentType, m.agentDescription, m.model].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(q);
    });
  });

  const subagentTokenUsage = computed(() => {
    if (!selectedSubagent.value) return null;
    const { ownerMap, subagentInfo } = subagentOwnership.value;
    const tcid = selectedSubagent.value;
    if (!subagentInfo.has(tcid)) return null;
    let eventCount = 0, startTime = null, endTime = null;
    for (const ev of flatEvents.value) {
      const isSubagentDivider = (ev.type === 'subagent.started' || ev.type === 'subagent.completed' || ev.type === 'subagent.failed') && ev.data?.toolCallId === tcid;
      const isOwned = ownerMap.get(ev.stableId) === tcid;
      const isSubagentMeta = ev._subagent?.id === tcid;
      const isVsCode = ev.data?.subAgentId === tcid;
      if (isSubagentDivider || isOwned || isSubagentMeta || isVsCode) {
        eventCount++;
        if (ev.timestamp !== null && ev.timestamp !== undefined) {
          const t = new Date(ev.timestamp).getTime();
          if (startTime === null || t < startTime) startTime = t;
          if (endTime === null || t > endTime) endTime = t;
        }
      }
    }
    const durationMs = startTime === null || endTime === null ? 0 : endTime - startTime;
    return { eventCount, durationMs };
  });

  // ── Formatting helpers ──

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  };

  const formatToolTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  const formatTokens = (num) => {
    if (!num || num === 0) return '0';
    if (num < 1000) return num.toString();
    return Math.floor(num / 1000) + 'K';
  };

  const formatDuration = (ms) => {
    if (!ms || ms === 0) return '0s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return (ms / 1000).toFixed(1) + 's';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatCost = (cost) => {
    if (cost === undefined || cost === null) return '';
    return cost + ' premium';
  };

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // ── Markdown rendering ──

  const markdownCache = new Map();
  const MAX_CACHE_SIZE = 200;

  const renderMarkdown = (text) => {
    if (!text) return '';
    if (markdownCache.has(text)) return markdownCache.get(text);
    try {
      const processedText = text
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

      const purifyConfig = {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'del', 'span', 'div', 'mark'],
        ALLOWED_ATTR: ['href', 'style', 'class'],
        ALLOW_DATA_ATTR: false,
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
      };

      const frontmatterMatch = processedText.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const content = frontmatterMatch[2];
        const lines = frontmatter.split('\n');
        const pairs = [];
        let i = 0;
        while (i < lines.length) {
          const line = lines[i];
          if (!line.trim() || !line.includes(':')) { i++; continue; }
          const colonIndex = line.indexOf(':');
          const key = line.substring(0, colonIndex).trim();
          const rawVal = line.substring(colonIndex + 1).trim();
          if (rawVal === '|' || rawVal === '>') {
            const blockLines = [];
            i++;
            while (i < lines.length && (lines[i].startsWith('  ') || lines[i].startsWith('\t') || lines[i].trim() === '')) {
              blockLines.push(lines[i].trim());
              i++;
            }
            const joiner = rawVal === '>' ? ' ' : '\n';
            pairs.push({ key, value: blockLines.filter(l => l).join(joiner) });
          } else {
            pairs.push({ key, value: rawVal });
            i++;
          }
        }
        let tableHTML = '<table style="margin-bottom: 16px; border-collapse: collapse; width: 100%;"><tbody>';
        pairs.forEach(pair => {
          const sanitizedKey = DOMPurify.sanitize(pair.key, { ALLOWED_TAGS: [] });
          const sanitizedValue = DOMPurify.sanitize(pair.value, { ALLOWED_TAGS: [] });
          tableHTML += `<tr><td style="padding: 4px 12px; border: 1px solid #30363d; font-weight: 600; color: #7d8590;">${sanitizedKey}</td><td style="padding: 4px 12px; border: 1px solid #30363d;">${sanitizedValue}</td></tr>`;
        });
        tableHTML += '</tbody></table>';
        const markdownHTML = marked.parse(content);
        const sanitizedMarkdown = DOMPurify.sanitize(markdownHTML, purifyConfig);
        const result = tableHTML + sanitizedMarkdown;
        if (markdownCache.size >= MAX_CACHE_SIZE) markdownCache.delete(markdownCache.keys().next().value);
        markdownCache.set(text, result);
        return result;
      }

      const markdownHTML = marked.parse(processedText);
      const result = DOMPurify.sanitize(markdownHTML, purifyConfig);
      if (markdownCache.size >= MAX_CACHE_SIZE) markdownCache.delete(markdownCache.keys().next().value);
      markdownCache.set(text, result);
      return result;
    } catch (e) {
      return text;
    }
  };

  // ── Toggle helpers ──

  const toggleTool = (toolId) => {
    const newState = { ...expandedTools.value };
    if (newState[toolId]) { delete newState[toolId]; } else { newState[toolId] = true; }
    expandedTools.value = newState;
  };

  const toggleContent = (contentId) => {
    const newState = { ...expandedContent.value };
    if (newState[contentId]) { delete newState[contentId]; } else { newState[contentId] = true; }
    expandedContent.value = newState;
  };

  const highlightSearchText = (html, searchTerm) => {
    if (!searchTerm || !searchTerm.trim() || !html) return html;
    const term = searchTerm.trim();
    const escapedTerm = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const highlightTextNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const regex = new RegExp(`(${escapedTerm})`, 'gi');
        if (regex.test(text)) {
          const highlighted = text.replace(regex, '<mark class="search-highlight">$1</mark>');
          const span = document.createElement('span');
          span.innerHTML = highlighted;
          node.parentNode.replaceChild(span, node);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
        Array.from(node.childNodes).forEach(highlightTextNode);
      }
    };
    Array.from(temp.childNodes).forEach(highlightTextNode);
    return temp.innerHTML;
  };

  const isContentTooLong = (text) => {
    if (!text) return false;
    return text.split('\n').length > 20 || text.length > 2000;
  };

  const truncateContent = (text) => {
    const lines = text.split('\n');
    if (lines.length <= 20) return text;
    return lines.slice(0, 20).join('\n') + '\n\n...';
  };

  // ── Badge helpers ──

  const getBadgeInfo = (type, item) => {
    if (item?.data?.badgeLabel && item?.data?.badgeClass) {
      return { label: item.data.badgeLabel, style: badgeClassToStyle(item.data.badgeClass) };
    }
    if (type === 'message' && item?.data?.role === 'toolResult') {
      return { label: 'TOOL RESULT', style: { backgroundColor: '#9e6a03', color: '#fff' } };
    }
    if (type === 'session.model_change') return { label: 'MODEL CHANGE', style: { backgroundColor: 'var(--color-text-faint)', color: '#fff' } };
    if (type === 'session.truncation') return { label: 'TRUNCATION', style: { backgroundColor: '#e5534b', color: '#fff' } };
    if (type === 'session.compaction_start' || type === 'session.compaction_complete') return { label: 'COMPACTION', style: { backgroundColor: '#c2442d', color: '#fff' } };
    if (type === 'system.notification') return { label: 'SYSTEM', style: { backgroundColor: 'var(--color-surface-overlay)', color: '#adbac7', fontStyle: 'italic' } };
    const parts = (type || '').split('.');
    const category = parts[0] || 'unknown';
    const badges = {
      user: { label: 'USER', style: { backgroundColor: 'var(--color-accent-emphasis)', color: '#fff' } },
      assistant: { label: 'ASSISTANT', style: { backgroundColor: 'var(--color-success-emphasis)', color: '#fff' } },
      reasoning: { label: 'REASONING', style: { backgroundColor: 'var(--color-purple-light)', color: '#fff' } },
      turn: { label: 'TURN', style: { backgroundColor: 'var(--color-success-emphasis)', color: '#fff' } },
      tool: { label: 'TOOL', style: { backgroundColor: '#9e6a03', color: '#fff' } },
      subagent: { label: 'SUBAGENT', style: { backgroundColor: '#8957e5', color: '#fff' } },
      skill: { label: 'SKILL', style: { backgroundColor: 'var(--color-pink)', color: '#fff' } },
      session: { label: 'SESSION', style: { backgroundColor: 'var(--color-text-faint)', color: '#fff' } },
      error: { label: 'ERROR', style: { backgroundColor: 'var(--color-danger)', color: '#fff' } },
      abort: { label: 'ABORT', style: { backgroundColor: 'var(--color-danger)', color: '#fff' } }
    };
    return badges[category] || { label: category.toUpperCase(), style: { backgroundColor: 'var(--color-accent)', color: '#fff' } };
  };

  // Helper: convert legacy badgeClass string to inline style
  function badgeClassToStyle(cls) {
    const style = { color: '#fff' };
    const bgMatch = cls.match(/bg-\[([^\]]+)\]/);
    if (bgMatch) {
      style.backgroundColor = bgMatch[1];
    } else if (cls.includes('bg-accent-emphasis')) {
      style.backgroundColor = 'var(--color-accent-emphasis)';
    } else if (cls.includes('bg-success-emphasis')) {
      style.backgroundColor = 'var(--color-success-emphasis)';
    } else if (cls.includes('bg-purple-light')) {
      style.backgroundColor = 'var(--color-purple-light)';
    } else if (cls.includes('bg-text-faint')) {
      style.backgroundColor = 'var(--color-text-faint)';
    } else if (cls.includes('bg-danger')) {
      style.backgroundColor = 'var(--color-danger)';
    } else if (cls.includes('bg-surface-overlay')) {
      style.backgroundColor = 'var(--color-surface-overlay)';
    } else if (cls.includes('bg-pink')) {
      style.backgroundColor = 'var(--color-pink)';
    } else if (cls.includes('bg-accent')) {
      style.backgroundColor = 'var(--color-accent)';
    }
    if (cls.includes('italic')) style.fontStyle = 'italic';
    return style;
  }

  // ── Tool helpers ──

  const getToolStatus = (group) => {
    if (!group.complete) return { icon: '⏳', color: 'text-warning', text: '' };
    const completeData = group.complete.data || {};
    if (completeData.error || completeData.isError) return { icon: '❌', color: 'text-danger', text: '' };
    return { icon: '✓', color: 'text-success-emphasis', text: '' };
  };

  const getToolErrorMessage = (group) => {
    if (!group.complete?.data?.error) return '';
    const error = group.complete.data.error;
    if (typeof error === 'object' && error.message) return error.message;
    if (typeof error === 'string') {
      try { const parsed = JSON.parse(error); if (parsed.message) return parsed.message; } catch (_e) { /* noop */ }
      return error;
    }
    return String(error);
  };

  const getToolDuration = (group) => {
    if (!group.complete) return '';
    const durationMs = new Date(group.complete.timestamp).getTime() - new Date(group.start.timestamp).getTime();
    if (durationMs >= 100) return `${parseFloat((durationMs / 1000).toPrecision(3))}s`;
    return '';
  };

  const getToolCommand = (group) => {
    if (!group.start) return '';
    const args = group.start.data?.arguments || {};
    const toolName = group.start.data?.toolName || group.tool || '';
    let command;
    if (toolName === 'bash' || toolName === 'exec') command = args.command || args.description || '';
    else if (toolName === 'ask_user') command = args.question || args.message || '';
    else if (toolName === 'read' || toolName === 'write' || toolName === 'edit') command = args.file_path || args.path || '';
    else if (toolName === 'view') command = args.path || args.file || '';
    else if (toolName === 'create') command = args.path || args.name || '';
    else if (toolName === 'report_intent') command = args.intent || args.message || '';
    else if (toolName === 'web_search') command = args.query || '';
    else if (toolName === 'web_fetch') command = args.url || '';
    else if (toolName === 'browser') {
      const action = args.action || '';
      const url = args.targetUrl || args.url || '';
      command = url ? `${action} ${url}` : action;
    } else {
      command = args.description || args.command || args.message || args.path || args.file_path || args.query || '';
    }
    if (command && command.length > 200) command = command.substring(0, 200) + '...';
    return command;
  };

  const hasTools = (event) => event.data?.tools && event.data.tools.length > 0;

  const getToolGroups = (event) => {
    if (event.data?.tools && Array.isArray(event.data.tools)) {
      return event.data.tools
        .filter(tool => tool && typeof tool === 'object' && tool.name)
        .map(tool => {
          const hasResult = tool.result !== undefined || tool.status === 'completed' || tool.status === 'error';
          const timingResult = {};
          if (tool.startTime) timingResult.startTime = tool.startTime;
          if (tool.endTime) timingResult.endTime = tool.endTime;
          if (timingResult.startTime && timingResult.endTime) {
            const durationMs = new Date(timingResult.endTime).getTime() - new Date(timingResult.startTime).getTime();
            if (durationMs >= 0) timingResult.duration = `${parseFloat((durationMs / 1000).toPrecision(3))}s (${durationMs}ms)`;
          }
          return {
            tool: tool.name,
            timing: timingResult,
            start: { timestamp: tool.startTime, data: { toolName: tool.name, arguments: tool.input || tool.arguments || {} } },
            complete: hasResult ? { timestamp: tool.endTime, data: { result: tool.result, error: tool.status === 'error' ? tool.error : null } } : null
          };
        });
    }
    return [];
  };

  // ── Subagent helpers ──

  const hashCode = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return hash;
  };

  const getSubagentInfo = (event) => {
    const { ownerMap, subagentInfo } = subagentOwnership.value;
    if (event.type === 'subagent.started' || event.type === 'subagent.completed' || event.type === 'subagent.failed') {
      const tcid = event.data?.toolCallId;
      if (tcid && subagentInfo.has(tcid)) {
        const info = subagentInfo.get(tcid);
        return { name: info.name, toolCallId: tcid, colorIndex: info.colorIndex };
      }
      return null;
    }
    if (event._subagent) {
      const subagentId = event._subagent.id;
      if (subagentInfo.has(subagentId)) {
        const info = subagentInfo.get(subagentId);
        return { name: info.name, toolCallId: subagentId, colorIndex: info.colorIndex };
      }
      return { name: event._subagent.name, toolCallId: subagentId, colorIndex: Math.abs(hashCode(subagentId)) };
    }
    if (event.data?.subAgentId) {
      const sid = event.data.subAgentId;
      const info = subagentInfo.get(sid);
      if (info) return { name: info.name, toolCallId: sid, colorIndex: info.colorIndex };
    }
    const tcid = ownerMap.get(event.stableId);
    if (!tcid) return null;
    const info = subagentInfo.get(tcid);
    if (!info) return null;
    return { name: info.name, toolCallId: tcid, colorIndex: info.colorIndex };
  };

  const getSubagentColor = (event) => {
    const info = getSubagentInfo(event);
    if (!info) return null;
    return SUBAGENT_COLORS[info.colorIndex % SUBAGENT_COLORS.length];
  };

  // ── Actions ──

  const setFilter = (type) => { currentFilter.value = type; };

  const selectSubagent = (toolCallId) => {
    selectedSubagent.value = toolCallId;
    subagentDropdownOpen.value = false;
    subagentSearchQuery.value = '';
    if (toolCallId) currentFilter.value = 'all';
  };

  const scrollToTurn = (turn) => {
    searchText.value = '';
    currentFilter.value = 'all';
    selectedSubagent.value = null;
    currentTurnIndex.value = turn.id;
    nextTick(() => {
      if (scrollerRef.value) {
        const targetIndex = filteredEvents.value.findIndex(e => e.virtualIndex === turn.index);
        if (targetIndex >= 0) {
          const doScroll = (attempts) => {
            if (attempts <= 0 || !scrollerRef.value) return;
            scrollerRef.value.scrollToItem(targetIndex);
            setTimeout(() => doScroll(attempts - 1), 100);
          };
          setTimeout(() => doScroll(3), 50);
        }
      }
    });
  };

  const scrollToTop = () => {
    if (!scrollerRef.value) return;
    const doScroll = (a) => { if (a <= 0 || !scrollerRef.value) return; scrollerRef.value.scrollToItem(0); setTimeout(() => doScroll(a - 1), 100); };
    doScroll(3);
  };

  const scrollToBottom = () => {
    if (!scrollerRef.value) return;
    const lastIndex = filteredEvents.value.length - 1;
    const doScroll = (a) => { if (a <= 0 || !scrollerRef.value) return; scrollerRef.value.scrollToItem(lastIndex); setTimeout(() => doScroll(a - 1), 100); };
    doScroll(5);
  };

  const jumpToTurn = (turnId) => {
    const turn = turns.value.find(t => t.id === turnId);
    if (turn) {
      const eventName = `UserReq${turn.userReqNumber}_Turn${turn.id}`;
      const newUrl = `${window.location.pathname}?eventType=assistant.turn_start&eventName=${eventName}`;
      window.history.pushState({}, '', newUrl);
      scrollToTurn(turn);
    }
  };

  const repoBasename = (cwd) => {
    if (!cwd) return '';
    const parts = cwd.replace(/\/$/, '').split('/');
    return parts[parts.length - 1] || cwd;
  };

  const getTurnNumber = (virtualIndex) => {
    const turn = turns.value.find(t => t.index === virtualIndex);
    if (!turn) return '?';
    const turnLabel = turn.originalTurnId ?? turn.id;
    if (turn.userReqNumber > 0) return `${turn.userReqNumber} - Turn ${turnLabel}`;
    return `Turn ${turnLabel}`;
  };

  const getTurnDuration = (virtualIndex) => {
    const turn = turns.value.find(t => t.index === virtualIndex);
    return turn?.duration || null;
  };

  const exportSession = async () => {
    exporting.value = true;
    try {
      const response = await fetch(`/api/${encodeURIComponent(source.value)}/sessions/${sessionId.value}/export`);
      if (!response.ok) throw new Error('Share failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${sessionId.value}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert('Failed to share session: ' + err.message);
    } finally {
      exporting.value = false;
    }
  };

  // ── Usage computed ──

  const totalTokens = computed(() => {
    if (!metadata.value.usage?.modelMetrics) return 0;
    let total = 0;
    for (const model in metadata.value.usage.modelMetrics) {
      const usage = metadata.value.usage.modelMetrics[model].usage;
      if (usage) total += (usage.inputTokens || 0) + (usage.outputTokens || 0);
    }
    return total;
  });

  const totalRequests = computed(() => {
    if (!metadata.value.usage?.modelMetrics) return 0;
    let total = 0;
    for (const model in metadata.value.usage.modelMetrics) {
      total += (metadata.value.usage.modelMetrics[model].requests?.count || 0);
    }
    return total;
  });

  const totalModels = computed(() => {
    if (!metadata.value.usage?.modelMetrics) return 0;
    return Object.keys(metadata.value.usage.modelMetrics).length;
  });

  const getModelCacheHitRatio = (model) => {
    const metrics = metadata.value.usage?.modelMetrics[model];
    if (!metrics?.usage) return null;
    return getUsageCacheHitRatio(metrics.usage);
  };

  const getDisplayUsageInputTokens = (model) => {
    const metrics = metadata.value.usage?.modelMetrics[model];
    if (!metrics?.usage) return 0;
    return getDisplayInputTokens(metrics.usage);
  };

  const toolCallingSummary = computed(() => {
    const countMap = new Map();
    for (const event of flatEvents.value) {
      if (event.data?.tools && Array.isArray(event.data.tools)) {
        for (const tool of event.data.tools) {
          if (tool?.name) countMap.set(tool.name, (countMap.get(tool.name) || 0) + 1);
        }
      }
    }
    return Array.from(countMap, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  });

  // ── Tags ──

  const sessionTags = ref([]);
  const allTags = ref([]);
  const tagsEditing = ref(false);
  const editingTags = ref([]);
  const tagInputValue = ref('');
  const tagInputRef = ref(null);
  const tagsError = ref('');
  const showAutocomplete = ref(false);
  const autocompleteOptions = ref([]);
  const autocompleteSelectedIndex = ref(0);

  const getTagColor = (tag) => {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
  };

  const loadTags = async () => {
    try {
      const response = await fetch(`/api/${encodeURIComponent(source.value)}/sessions/${sessionId.value}/tags`);
      if (response.ok) { const data = await response.json(); sessionTags.value = data.tags || []; }
    } catch (err) { console.error('Error loading tags:', err); }
  };

  const loadAllTags = async () => {
    try {
      const response = await fetch('/api/tags');
      if (response.ok) { const data = await response.json(); allTags.value = data.tags || []; }
    } catch (err) { console.error('Error loading all tags:', err); }
  };

  const saveTags = async (tags) => {
    try {
      const response = await fetch(`/api/${encodeURIComponent(source.value)}/sessions/${sessionId.value}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags })
      });
      if (response.ok) {
        const data = await response.json();
        sessionTags.value = data.tags || [];
        tagsError.value = '';
        return true;
      } else {
        const error = await response.json();
        tagsError.value = error.error || 'Failed to save tags';
        return false;
      }
    } catch (err) {
      tagsError.value = 'Network error';
      return false;
    }
  };

  const startEditTags = () => {
    editingTags.value = [...sessionTags.value];
    tagsEditing.value = true;
    tagsError.value = '';
    setTimeout(() => tagInputRef.value?.focus(), 10);
  };

  const cancelEditTags = () => {
    tagsEditing.value = false;
    editingTags.value = [];
    tagInputValue.value = '';
    showAutocomplete.value = false;
    tagsError.value = '';
  };

  const addTag = () => {
    const tag = tagInputValue.value.trim().toLowerCase();
    if (!tag) return;
    if (tag.length > 30) { tagsError.value = 'Tag must be 30 characters or less'; return; }
    if (editingTags.value.length >= 10) { tagsError.value = 'Maximum 10 tags per session'; return; }
    if (editingTags.value.includes(tag)) { tagsError.value = 'Tag already added'; tagInputValue.value = ''; return; }
    editingTags.value.push(tag);
    tagInputValue.value = '';
    showAutocomplete.value = false;
    tagsError.value = '';
  };

  const removeTagFromEdit = (tag) => {
    editingTags.value = editingTags.value.filter(t => t !== tag);
    tagsError.value = '';
  };

  const updateAutocomplete = () => {
    const input = tagInputValue.value.trim().toLowerCase();
    if (!input) { showAutocomplete.value = false; autocompleteOptions.value = []; return; }
    const filtered = allTags.value.filter(tag => tag.toLowerCase().includes(input) && !editingTags.value.includes(tag)).slice(0, 5);
    if (filtered.length > 0) { showAutocomplete.value = true; autocompleteOptions.value = filtered; autocompleteSelectedIndex.value = 0; }
    else { showAutocomplete.value = false; autocompleteOptions.value = []; }
  };

  const selectAutocompleteOption = (option) => { tagInputValue.value = option; addTag(); };

  const saveTagsOnBlur = async () => {
    setTimeout(async () => {
      if (!tagsEditing.value) return;
      const success = await saveTags(editingTags.value);
      if (success) {
        tagsEditing.value = false;
        editingTags.value = [];
        tagInputValue.value = '';
        showAutocomplete.value = false;
        await loadAllTags();
      }
    }, 200);
  };

  // ── Close dropdowns on outside click ──

  const closeTypeFilter = (e) => {
    const dropdown = document.querySelector('.filter-type-wrapper');
    if (dropdown && !dropdown.contains(e.target)) typeFilterOpen.value = false;
  };

  const closeSubagentDropdown = () => { subagentDropdownOpen.value = false; };

  const handleKeydown = (e) => {
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      sidebarCollapsed.value = !sidebarCollapsed.value;
    }
  };

  // ── Lifecycle ──

  onMounted(async () => {
    document.addEventListener('click', closeTypeFilter);
    document.addEventListener('click', closeSubagentDropdown);
    window.addEventListener('keydown', handleKeydown);

    marked.setOptions({ breaks: true, gfm: true });

    // Load metadata (from store cache or API)
    const sessionStore = (await import('../../stores/sessionStore.js')).useSessionStore();
    try {
      const metaData = await sessionStore.fetchMetadata(sessionId.value, source.value);
      if (metaData) {
        metadata.value = metaData;
      }
    } catch (err) {
      console.error('Error loading metadata:', err);
    }

    // Load events (from store cache or API)
    try {
      loadedEvents.value = await sessionStore.fetchEvents(sessionId.value, source.value);

      // Update 'Updated' time from last event timestamp
      if (loadedEvents.value.length > 0) {
        const lastEvent = loadedEvents.value[loadedEvents.value.length - 1];
        const lastTime = lastEvent.timestamp || lastEvent.time || lastEvent.data?.timestamp;
        if (lastTime) metadata.value.updated = new Date(lastTime);
      }

      // Handle URL query params for navigation
      const urlParams = new URLSearchParams(window.location.search);
      const eventTypeParam = urlParams.get('eventType');
      const eventNameParam = urlParams.get('eventName');
      const eventTimestampParam = urlParams.get('eventTimestamp');

      if (eventTypeParam && eventNameParam) {
        nextTick(() => {
          let targetEvent = null;
          if (eventTypeParam === 'assistant.turn_start') {
            const match = eventNameParam.match(/UserReq(\d+)_Turn(\d+)/);
            if (match) {
              const turnId = parseInt(match[2], 10);
              if (!isNaN(turnId)) { jumpToTurn(turnId); return; }
            }
          } else if (eventTypeParam === 'subagent.started') {
            if (eventTimestampParam) {
              targetEvent = flatEvents.value.find(e => e.type === 'subagent.started' && e.timestamp === eventTimestampParam);
            }
            if (!targetEvent) {
              targetEvent = flatEvents.value.find(e =>
                e.type === 'subagent.started' &&
                (e.data?.agentDisplayName === eventNameParam || e.data?.agentName === eventNameParam || e.data?.label === eventNameParam)
              );
            }
          } else {
            targetEvent = flatEvents.value.find(e => e.type === eventTypeParam);
          }

          if (targetEvent) {
            const targetIndex = filteredEvents.value.findIndex(e => e.virtualIndex === targetEvent.virtualIndex);
            if (targetIndex >= 0 && scrollerRef.value) {
              const doScroll = (attempts) => {
                if (attempts <= 0 || !scrollerRef.value) return;
                scrollerRef.value.scrollToItem(targetIndex);
                setTimeout(() => doScroll(attempts - 1), 100);
              };
              setTimeout(() => doScroll(3), 50);
            }
          }
        });
      }
    } catch (error) {
      eventsError.value = error.message;
    } finally {
      eventsLoading.value = false;
    }

    // Load tags
    await loadTags();
    await loadAllTags();

    // Scroll listener for visible range
    setTimeout(() => {
      const scroller = document.querySelector('.vue-recycle-scroller');
      if (scroller) {
        const updateVisibleRange = () => {
          const scrollTop = scroller.scrollTop;
          const clientHeight = scroller.clientHeight;
          const avgItemHeight = 80;
          const startIndex = Math.floor(scrollTop / avgItemHeight);
          const visibleCount = Math.ceil(clientHeight / avgItemHeight);
          const endIndex = Math.min(startIndex + visibleCount, filteredEvents.value.length);
          const startPos = Math.max(1, startIndex + 1);
          const endPos = Math.max(1, endIndex);
          visibleRange.value = { start: Math.min(startPos, endPos), end: endPos };
        };
        scroller.addEventListener('scroll', updateVisibleRange);
        scrollCleanup = () => scroller.removeEventListener('scroll', updateVisibleRange);
        updateVisibleRange();
      }
    }, 500);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('click', closeTypeFilter);
    document.removeEventListener('click', closeSubagentDropdown);
    window.removeEventListener('keydown', handleKeydown);
    if (searchTimeout) { clearTimeout(searchTimeout); searchTimeout = null; }
    if (scrollCleanup) { scrollCleanup(); scrollCleanup = null; }
    expandedTools.value = {};
    expandedContent.value = {};
    markdownCache.clear();
  });

  return {
    sessionId, source, metadata, exporting, sidebarCollapsed,
    expandedTools, expandedContent, expansionCount,
    currentFilter, searchText, debouncedSearchText, currentTurnIndex,
    scrollerRef, visibleRange,
    loadedEvents, eventsLoading, eventsError,
    flatEvents, filteredEvents, eventCounts, filters,
    turns, userReqs, truncateText,
    formatTime, formatToolTime, formatDateTime,
    renderMarkdown, highlightSearchText,
    toggleTool, toggleContent, isContentTooLong, truncateContent,
    getBadgeInfo, getToolStatus, getToolErrorMessage, getToolDuration, getToolCommand,
    hasTools, getToolGroups,
    getSubagentInfo, getSubagentColor, subagentOwnership,
    setFilter, selectSubagent, selectedSubagent,
    subagentList, filteredSubagentList,
    subagentDropdownOpen, subagentSearchQuery, subagentSearchRef,
    subagentTokenUsage, SUBAGENT_COLORS,
    typeFilterOpen, activeFilterCount, clearAllFilters,
    scrollToTurn, scrollToTop, scrollToBottom, jumpToTurn,
    getTurnNumber, getTurnDuration, repoBasename, escapeHtml,
    exportSession, searchResultCount,
    // Tags
    sessionTags, allTags, tagsEditing, editingTags, tagInputValue, tagInputRef,
    tagsError, showAutocomplete, autocompleteOptions, autocompleteSelectedIndex,
    getTagColor, startEditTags, cancelEditTags, addTag, removeTagFromEdit,
    updateAutocomplete, selectAutocompleteOption, saveTagsOnBlur,
    // Usage
    formatTokens, formatDuration, formatCost,
    totalTokens, totalRequests, totalModels,
    getDisplayUsageInputTokens, getModelCacheHitRatio, toolCallingSummary
  };
}
