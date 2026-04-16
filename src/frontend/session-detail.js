/**
 * Session Detail Vue Application
 *
 * Extracted from views/session-vue.ejs
 * This file contains the Vue 3 Composition API code for the session detail view.
 *
 * EJS template variables have been replaced with reads from window.__PAGE_DATA:
 * - sessionId: window.__PAGE_DATA.sessionId
 * - metadata: window.__PAGE_DATA.metadata
 */

// Immediate initialization (script is at bottom, DOM is ready)
(function() {
  // Shared subagent ownership/filtering logic
  const { computeSubagentOwnership, filterBySubagent } = require('./subagent-utils');
  const { getDisplayInputTokens, getCacheHitRatio: getUsageCacheHitRatio } = require('./usage-utils');

  // Verify Vue is loaded
  if (typeof Vue === 'undefined') {
    console.error('Vue is not loaded');
    return;
  }

  // Verify VueVirtualScroller is loaded
  if (typeof window.VueVirtualScroller === 'undefined') {
    console.error('VueVirtualScroller is not loaded');
    return;
  }

  console.log('Initializing Vue app...');

  const { createApp, ref, computed, onMounted, onBeforeUnmount, watch } = Vue;
  const { DynamicScroller, DynamicScrollerItem } = window.VueVirtualScroller;

  const app = createApp({
    components: {
      DynamicScroller,
      DynamicScrollerItem
    },

  setup() {
    const sessionId = ref(window.__PAGE_DATA.sessionId);
    const metadata = ref(window.__PAGE_DATA.metadata);
    const exporting = ref(false);

    // Load sidebar state from localStorage
    const isMobile = () => window.innerWidth <= 640;

    const sidebarCollapsed = ref(
      isMobile() ? true : localStorage.getItem('sidebarCollapsed') === 'true'
    );

    // Persist sidebar state to localStorage (desktop only)
    watch(sidebarCollapsed, (newValue) => {
      if (!isMobile()) localStorage.setItem('sidebarCollapsed', newValue.toString());
    });

    const expandedTools = ref({});
    const expandedContent = ref({});
    const MAX_EXPANDED_ITEMS = 50; // Memory leak fix: Limit expanded items

    // Clean up old expansion state to prevent memory leak
    const cleanupExpansionState = () => {
      const toolKeys = Object.keys(expandedTools.value);
      if (toolKeys.length > MAX_EXPANDED_ITEMS) {
        // Keep only recent 50 expanded items
        const toRemove = toolKeys.slice(0, toolKeys.length - MAX_EXPANDED_ITEMS);
        toRemove.forEach(key => delete expandedTools.value[key]);
      }

      const contentKeys = Object.keys(expandedContent.value);
      if (contentKeys.length > MAX_EXPANDED_ITEMS) {
        const toRemove = contentKeys.slice(0, contentKeys.length - MAX_EXPANDED_ITEMS);
        toRemove.forEach(key => delete expandedContent.value[key]);
      }
    };

    const currentFilter = ref('all');
    const searchText = ref('');
    const debouncedSearchText = ref('');
    const currentTurnIndex = ref(0);  // Current selected turn
    const scrollerRef = ref(null);
    const visibleRange = ref({ start: 0, end: 0 });
    const selectedSubagent = ref(null); // null = all events, toolCallId = specific subagent
    const typeFilterOpen = ref(false); // Event type dropdown open state

    // Active filter count (computed)
    const activeFilterCount = computed(() => {
      let count = 0;
      if (currentFilter.value !== 'all') count++;
      if (selectedSubagent.value) count++;
      if (searchText.value.trim()) count++;
      return count;
    });

    // Clear all filters
    const clearAllFilters = () => {
      currentFilter.value = 'all';
      selectedSubagent.value = null;
      searchText.value = '';
      debouncedSearchText.value = '';
      typeFilterOpen.value = false;
    };

    // Debounce search input
    let searchTimeout = null;
    let scrollCleanup = null;
    watch(searchText, (newValue) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        debouncedSearchText.value = newValue;
        // Track search usage (debounced)
        if (newValue.trim() && window.trackClick) {
          window.trackClick('SearchUsed', {
            query: newValue.substring(0, 50), // First 50 chars
            resultCount: searchFilteredEvents.value.length,
            sessionId: sessionId.value
          });
        }
      }, 300);
    });

    // Memory leak fix: Clean up expansion state when filter/search changes
    watch(currentFilter, () => {
      cleanupExpansionState();
    });

    watch(debouncedSearchText, () => {
      cleanupExpansionState();
    });

    // Async loading state
    const loadedEvents = ref([]);
    const eventsLoading = ref(true);
    const eventsError = ref(null);

    // Flatten and sort events (stable sort using _fileIndex tiebreaker)
    const flatEvents = computed(() => {
      const events = loadedEvents.value
        .filter(e =>
          e.type !== 'assistant.turn_end' &&
          e.type !== 'assistant.turn_complete'
        )
        .sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          if (timeA !== timeB) return timeA - timeB;
          return (a._fileIndex ?? 0) - (b._fileIndex ?? 0);
        })
        .map((e, index) => ({
          ...e,
          virtualIndex: index,
          stableId: e.id || `${e.timestamp}-${e.type}-${index}`  // Stable ID for toggle state
        }));
      return events;
    });

    // Helper: check if event matches search
    const matchesSearch = (e) => {
      if (!debouncedSearchText.value.trim()) return true;

      const search = debouncedSearchText.value.toLowerCase();
      // Only search in event.data fields, not type
      const content = [
        e.data?.message,
        e.data?.text,
        e.data?.content,
        e.data?.reason,
        e.data?.reasoningText,
        e.data?.errorType,
        e.data?.previousModel,
        e.data?.newModel
      ].filter(Boolean).join(' ').toLowerCase();

      return content.includes(search);
    };

    // Events after search (before type filter) - used for filter counts
    const searchFilteredEvents = computed(() => {
      const excludeToolCalls = (e) => {
        const eventType = e.type || '';
        return eventType !== 'tool.execution_start' && eventType !== 'tool.execution_complete';
      };

      let events = flatEvents.value.filter(excludeToolCalls);

      // Apply search only (use debouncedSearchText for consistency)
      if (debouncedSearchText.value.trim()) {
        events = events.filter(matchesSearch);
      }

      return events;
    });

    // Final filtered events (search + type filter + subagent filter)
    const filteredEvents = computed(() => {
      let events = searchFilteredEvents.value;

      // Apply subagent filter
      if (selectedSubagent.value) {
        const { ownerMap } = subagentOwnership.value;
        events = filterBySubagent(events, selectedSubagent.value, ownerMap);
      }

      // Apply type filter
      if (currentFilter.value !== 'all') {
        events = events.filter(e => e.type === currentFilter.value);
      }

      // Divider types (no separator before these)
      const dividerTypes = ['assistant.turn_start', 'subagent.started', 'subagent.completed', 'subagent.failed'];

      // Mark events that shouldn't have separator
      const totalCount = events.length;
      return events.map((e, index) => {
        const nextItem = events[index + 1];
        const isLast = index === totalCount - 1;
        const nextIsDivider = nextItem && dividerTypes.includes(nextItem.type);

        return {
          ...e,
          filteredIndex: index,
          filteredTotal: totalCount,
          isLastEvent: isLast || nextIsDivider  // Hide separator if last OR next is divider
        };
      });
    });

    // Event type counts (based on search results)
    const eventCounts = computed(() => {
      const counts = {};
      searchFilteredEvents.value.forEach(e => {
        if (e.type) {
          counts[e.type] = (counts[e.type] || 0) + 1;
        }
      });
      return counts;
    });

    // Search result count for display
    const searchResultCount = computed(() => {
      if (!debouncedSearchText.value.trim()) return null;
      const count = searchFilteredEvents.value.length;
      return count > 0 ? `${count} result${count !== 1 ? 's' : ''}` : 'No matches';
    });

    // Track expansion state changes for size-dependencies
    const expansionCount = computed(() => {
      const toolsExpanded = Object.keys(expandedTools.value).filter(k => expandedTools.value[k]).length;
      const contentExpanded = Object.keys(expandedContent.value).filter(k => expandedContent.value[k]).length;
      return toolsExpanded + contentExpanded;
    });

    // Available filters (with counts based on search results)
    const filters = computed(() => {
      const totalEvents = searchFilteredEvents.value.length;

      // Start with "All" filter
      const result = [{ type: 'all', label: `All (${totalEvents})`, count: totalEvents }];

      // Dynamically extract all event types from actual events
      const typeCounts = {};
      searchFilteredEvents.value.forEach(e => {
        if (e.type) {
          typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
        }
      });

      // Convert to array and sort by count (descending)
      const sortedTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])  // Sort by count descending
        .map(([type, count]) => ({
          type,
          label: `${type} (${count})`,
          count,
          disabled: false
        }));

      return [...result, ...sortedTypes];
    });

    // Turns
    const turns = computed(() => {
      const turnStarts = flatEvents.value.filter(e => e.type === 'assistant.turn_start');
      const allUserMessages = flatEvents.value.filter(e => e.type === 'user.message');

      return turnStarts.map((turn, idx) => {
        // Use idx as the display turn number (sequential, no duplicates)
        const turnId = idx;
        const startTime = new Date(turn.timestamp).getTime();

        // Find turn end
        let endTime;
        const nextTurnIndex = turnStarts.indexOf(turn) + 1;
        if (nextTurnIndex < turnStarts.length) {
          endTime = new Date(turnStarts[nextTurnIndex].timestamp).getTime();
        } else {
          endTime = Date.now();
        }

        // Calculate duration
        const durationMs = endTime - startTime;
        const totalSeconds = Math.floor(durationMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        // Find user message before this turn
        const userMessage = flatEvents.value
          .slice(0, flatEvents.value.indexOf(turn))
          .reverse()
          .find(e => e.type === 'user.message');

        // Calculate UserReq number (1-indexed)
        const userReqNumber = userMessage
          ? allUserMessages.indexOf(userMessage) + 1
          : 0;

        return {
          id: turnId,
          index: turn.virtualIndex,
          originalTurnId: turn.data?.turnId,  // Keep original for reference
          timestamp: turn.timestamp,
          duration: durationText,
          message: userMessage?.data?.content || userMessage?.data?.transformedContent || '',
          userReqNumber: userReqNumber
        };
      });
    });

    // Group turns by UserReq for optgroup navigation
    const userReqs = computed(() => {
      const groups = [];
      const reqMap = new Map();

      turns.value.forEach(turn => {
        const reqNum = turn.userReqNumber || 0;
        if (!reqMap.has(reqNum)) {
          const group = {
            reqNumber: reqNum,
            message: turn.message,
            turns: []
          };
          reqMap.set(reqNum, group);
          groups.push(group);
        }
        reqMap.get(reqNum).turns.push(turn);
      });

      return groups;
    });

    // Truncate text helper for optgroup labels
    const truncateText = (text, maxLen) => {
      if (!text) return '';
      if (text.length <= maxLen) return text;
      return text.substring(0, maxLen) + '…';
    };

    // Tool call map
    // Subagent ownership: attribute events to their owning subagent
    const subagentOwnership = computed(() => {
      return computeSubagentOwnership(flatEvents.value);
    });

    // List of subagents for the selector dropdown
    const subagentList = computed(() => {
      const { subagentInfo } = subagentOwnership.value;
      if (subagentInfo.size === 0) return [];
      const list = [];
      for (const [toolCallId, info] of subagentInfo) {
        list.push({ toolCallId, name: info.name, colorIndex: info.colorIndex });
      }
      return list;
    });

    // Token usage for the currently selected subagent (computed from events)
    const subagentTokenUsage = computed(() => {
      if (!selectedSubagent.value) return null;
      const { ownerMap, subagentInfo } = subagentOwnership.value;
      const tcid = selectedSubagent.value;
      if (!subagentInfo.has(tcid)) return null;

      let eventCount = 0;
      let startTime = null;
      let endTime = null;

      for (const ev of flatEvents.value) {
        // Count events belonging to this subagent
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
    const formatTime = (timestamp) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    };

    // Format timestamp as HH:mm:ss.mmm for tool timing display
    const formatToolTime = (timestamp) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      const ms = String(date.getMilliseconds()).padStart(3, '0');
      return `${hours}:${minutes}:${seconds}.${ms}`;
    };

    // Performance fix: Cache markdown rendering results
    const markdownCache = new Map();
    const MAX_CACHE_SIZE = 200;

    const renderMarkdown = (text) => {
      if (!text) return '';

      // Check cache first
      if (markdownCache.has(text)) {
        return markdownCache.get(text);
      }

      try {
        // 处理转义序列：将 \r\n、\n、\t 等转换为实际字符
        let processedText = text
          .replace(/\\r\\n/g, '\n')  // \r\n → 换行
          .replace(/\\n/g, '\n')      // \n → 换行
          .replace(/\\t/g, '\t')      // \t → 制表符
          .replace(/\\"/g, '"')       // \" → 引号
          .replace(/\\\\/g, '\\');    // \\ → 反斜杠

        // DOMPurify configuration for markdown content
        const purifyConfig = {
          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'del', 'span', 'div', 'mark'],
          ALLOWED_ATTR: ['href', 'style', 'class'],
          ALLOW_DATA_ATTR: false,
          ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
        };

        // Parse YAML frontmatter
        const frontmatterMatch = processedText.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          const content = frontmatterMatch[2];

          // Parse frontmatter into key-value pairs (supports multiline block scalars: | and >)
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
              // Collect subsequent indented lines
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

          // Render frontmatter as table (sanitize key/value)
          let tableHTML = '<table style="margin-bottom: 16px; border-collapse: collapse; width: 100%;"><tbody>';
          pairs.forEach(pair => {
            const sanitizedKey = DOMPurify.sanitize(pair.key, { ALLOWED_TAGS: [] });
            const sanitizedValue = DOMPurify.sanitize(pair.value, { ALLOWED_TAGS: [] });
            tableHTML += `<tr><td style="padding: 4px 12px; border: 1px solid #30363d; font-weight: 600; color: #7d8590;">${sanitizedKey}</td><td style="padding: 4px 12px; border: 1px solid #30363d;">${sanitizedValue}</td></tr>`;
          });
          tableHTML += '</tbody></table>';

          // Render remaining content with sanitization
          const markdownHTML = marked.parse(content);
          const sanitizedMarkdown = DOMPurify.sanitize(markdownHTML, purifyConfig);
          const result = tableHTML + sanitizedMarkdown;

          // Cache the result
          if (markdownCache.size >= MAX_CACHE_SIZE) {
            const firstKey = markdownCache.keys().next().value;
            markdownCache.delete(firstKey);
          }
          markdownCache.set(text, result);

          return result;
        }

        // Regular markdown rendering with sanitization
        const markdownHTML = marked.parse(processedText);
        const result = DOMPurify.sanitize(markdownHTML, purifyConfig);

        // Cache the result (with size limit to prevent memory leak)
        if (markdownCache.size >= MAX_CACHE_SIZE) {
          const firstKey = markdownCache.keys().next().value;
          markdownCache.delete(firstKey);
        }
        markdownCache.set(text, result);

        return result;
      } catch (e) {
        return text;
      }
    };

    const toggleTool = (toolId) => {
      const newState = { ...expandedTools.value };
      const wasExpanded = !!newState[toolId];
      if (newState[toolId]) {
        delete newState[toolId];
      } else {
        newState[toolId] = true;
      }
      expandedTools.value = newState;

      // Track tool expansion
      if (window.trackClick) {
        window.trackClick('EventExpanded', {
          eventType: 'tool',
          action: wasExpanded ? 'collapse' : 'expand',
          sessionId: sessionId.value
        });
      }
    };

    const highlightSearchText = (html, searchTerm) => {
      if (!searchTerm || !searchTerm.trim() || !html) return html;

      const term = searchTerm.trim();
      // Escape HTML in search term to prevent XSS
      const escapedTerm = escapeHtml(term)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Also escape regex special chars

      // Create a temporary element to parse HTML
      const temp = document.createElement('div');
      temp.innerHTML = html;

      // Function to highlight text in text nodes
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

    const toggleContent = (contentId) => {
      // Create new object to trigger Vue reactivity
      const newState = { ...expandedContent.value };
      const wasExpanded = !!newState[contentId];
      if (newState[contentId]) {
        delete newState[contentId];
      } else {
        newState[contentId] = true;
      }
      expandedContent.value = newState;

      // Track event expansion
      if (window.trackClick) {
        window.trackClick('EventExpanded', {
          eventType: 'content',
          action: wasExpanded ? 'collapse' : 'expand',
          sessionId: sessionId.value
        });
      }
    };

    const isContentTooLong = (text) => {
      if (!text) return false;
      const lineCount = text.split('\n').length;
      return lineCount > 20 || text.length > 2000;
    };

    const truncateContent = (text) => {
      const lines = text.split('\n');
      if (lines.length <= 20) return text;
      return lines.slice(0, 20).join('\n') + '\n\n...';
    };

    const getBadgeInfo = (type, item) => {
      // Prefer backend-generated badge info (Violation #4 fix)
      if (item?.data?.badgeLabel && item?.data?.badgeClass) {
        return { label: item.data.badgeLabel, class: item.data.badgeClass };
      }

      // Fallback: frontend logic for backward compatibility
      // Pi-Mono toolResult events: still use type='message' with role='toolResult'
      if (type === 'message' && item?.data?.role === 'toolResult') {
        return { label: 'TOOL RESULT', class: 'badge-tool' };
      }

      // Special case for specific event types
      if (type === 'session.model_change') {
        return { label: 'MODEL CHANGE', class: 'badge-session' };
      }
      if (type === 'session.truncation') {
        return { label: 'TRUNCATION', class: 'badge-truncation' };
      }
      if (type === 'session.compaction_start' || type === 'session.compaction_complete') {
        return { label: 'COMPACTION', class: 'badge-compaction' };
      }
      if (type === 'system.notification') {
        return { label: 'SYSTEM', class: 'badge-system' };
      }

      const parts = (type || '').split('.');
      const category = parts[0] || 'unknown';

      const badges = {
        user: { label: 'USER', class: 'badge-user' },
        assistant: { label: 'ASSISTANT', class: 'badge-assistant' },
        reasoning: { label: 'REASONING', class: 'badge-reasoning' },
        turn: { label: 'TURN', class: 'badge-turn' },
        tool: { label: 'TOOL', class: 'badge-tool' },
        subagent: { label: 'SUBAGENT', class: 'badge-subagent' },
        skill: { label: 'SKILL', class: 'badge-skill' },
        session: { label: 'SESSION', class: 'badge-session' },
        error: { label: 'ERROR', class: 'badge-error' },
        abort: { label: 'ABORT', class: 'badge-error' }
      };

      return badges[category] || { label: category.toUpperCase(), class: 'badge-info' };
    };

    const getToolStatus = (group) => {
      if (!group.complete) {
        return { icon: '⏳', color: 'tool-status-running', text: '' };
      }

      const completeData = group.complete.data || {};
      if (completeData.error || completeData.isError) {
        return { icon: '❌', color: 'tool-status-error', text: '' };
      }

      return { icon: '✓', color: 'tool-status-success', text: '' };
    };

    const getToolErrorMessage = (group) => {
      if (!group.complete?.data?.error) return '';

      const error = group.complete.data.error;

      // If error is an object with message property
      if (typeof error === 'object' && error.message) {
        return error.message;
      }

      // If error is a string, try to parse as JSON
      if (typeof error === 'string') {
        try {
          const parsed = JSON.parse(error);
          if (parsed.message) return parsed.message;
        } catch (e) {
          // Not JSON, return as-is
        }
        return error;
      }

      // Fallback to stringified error
      return String(error);
    };

    const getToolDuration = (group) => {
      if (!group.complete) return '';

      const startTime = new Date(group.start.timestamp).getTime();
      const endTime = new Date(group.complete.timestamp).getTime();
      const durationMs = endTime - startTime;

      if (durationMs >= 100) {
        return `${parseFloat((durationMs / 1000).toPrecision(3))}s`;
      }
      return '';
    };

    const _getToolTiming = (group) => {
      const result = {};
      if (group.start?.timestamp) result.startTime = group.start.timestamp;
      if (group.complete?.timestamp) result.endTime = group.complete.timestamp;
      if (result.startTime && result.endTime) {
        const durationMs = new Date(result.endTime).getTime() - new Date(result.startTime).getTime();
        if (durationMs >= 0) result.duration = `${parseFloat((durationMs / 1000).toPrecision(3))}s (${durationMs}ms)`;
      }
      return result;
    };

    const getToolCommand = (group) => {
      if (!group.start) return '';
      const args = group.start.data?.arguments || {};
      const toolName = group.start.data?.toolName || group.tool || '';

      let command = '';
      if (toolName === 'bash' || toolName === 'exec') {
        command = args.command || args.description || '';
      } else if (toolName === 'ask_user') {
        command = args.question || args.message || '';
      } else if (toolName === 'read' || toolName === 'write' || toolName === 'edit') {
        command = args.file_path || args.path || '';
      } else if (toolName === 'view') {
        command = args.path || args.file || '';
      } else if (toolName === 'create') {
        command = args.path || args.name || '';
      } else if (toolName === 'report_intent') {
        command = args.intent || args.message || '';
      } else if (toolName === 'web_search') {
        command = args.query || '';
      } else if (toolName === 'web_fetch') {
        command = args.url || '';
      } else if (toolName === 'browser') {
        const action = args.action || '';
        const url = args.targetUrl || args.url || '';
        command = url ? `${action} ${url}` : action;
      } else {
        command = args.description || args.command || args.message ||
                  args.path || args.file_path || args.query || '';
      }

      if (command && command.length > 200) {
        command = command.substring(0, 200) + '...';
      }

      return command;
    };

    const hasTools = (event) => {
      // Unified format: check data.tools (works for both Copilot and Claude)
      return event.data?.tools && event.data.tools.length > 0;
    };

    const getToolGroups = (event) => {
      // Unified format from server (both Copilot and Claude normalized to data.tools)
      if (event.data?.tools && Array.isArray(event.data.tools)) {
        return event.data.tools
          .filter(tool => tool && typeof tool === 'object' && tool.name) // Any tool object with a name
          .map(tool => {
            // Check if tool has result (works for all formats)
            const hasResult = tool.result !== undefined || tool.status === 'completed' || tool.status === 'error';
            // Precompute timing once per group to avoid repeated object creation in template
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
              start: {
                timestamp: tool.startTime,
                data: {
                  toolName: tool.name,
                  arguments: tool.input || tool.arguments || {}
                }
              },
              complete: hasResult ? {
                timestamp: tool.endTime,
                data: {
                  result: tool.result,
                  error: tool.status === 'error' ? tool.error : null
                }
              } : null
            };
          });
      }

      return [];
    };

    // Subagent color palette for parallel subagent distinction
    const SUBAGENT_COLORS = [
      '#58a6ff', // blue
      '#f0883e', // orange
      '#a371f7', // purple
      '#3fb950', // green
      '#f778ba', // pink
      '#79c0ff', // light blue
      '#d29922', // amber
      '#56d4dd'  // teal
    ];

    // Hash function for generating consistent color indices
    const hashCode = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return hash;
    };

    const getSubagentInfo = (event) => {
      const { ownerMap, subagentInfo } = subagentOwnership.value;
      // For subagent dividers, use their own toolCallId
      if (event.type === 'subagent.started' || event.type === 'subagent.completed' || event.type === 'subagent.failed') {
        const tcid = event.data?.toolCallId;
        if (tcid && subagentInfo.has(tcid)) {
          const info = subagentInfo.get(tcid);
          return { name: info.name, toolCallId: tcid, colorIndex: info.colorIndex };
        }
        return null;
      }
      // For regular events, first check _subagent metadata (Claude format)
      if (event._subagent) {
        const subagentId = event._subagent.id;
        const subagentName = event._subagent.name;
        // Use subagentId as toolCallId for consistency
        if (subagentInfo.has(subagentId)) {
          const info = subagentInfo.get(subagentId);
          return { name: info.name, toolCallId: subagentId, colorIndex: info.colorIndex };
        }
        // If not in subagentInfo, create a default entry
        return { name: subagentName, toolCallId: subagentId, colorIndex: Math.abs(hashCode(subagentId)) };
      }
      // VS Code format: subAgentId directly on the event data
      if (event.data?.subAgentId) {
        const sid = event.data.subAgentId;
        const info = subagentInfo.get(sid);
        if (info) return { name: info.name, toolCallId: sid, colorIndex: info.colorIndex };
      }
      // For regular events, look up ownership (Copilot format)
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

    const setFilter = (type) => {
      // Track event filter click
      if (window.trackClick) {
        const filter = filters.value.find(f => f.type === type);
        window.trackClick('EventFilterClicked', {
          filterType: type,
          filterLabel: filter ? filter.label : type,
          sessionId: sessionId.value
        });
      }
      currentFilter.value = type;
    };

    const selectSubagent = (toolCallId) => {
      selectedSubagent.value = toolCallId;
      // Reset type filter only when switching into a specific subagent view
      if (toolCallId) {
        currentFilter.value = 'all';
      }
      if (window.trackClick) {
        window.trackClick('SubagentSelected', {
          subagent: toolCallId,
          sessionId: sessionId.value
        });
      }
    };

    const scrollToTurn = (turn) => {
      // Clear search, filter, and subagent selection when jumping to a turn
      searchText.value = '';
      currentFilter.value = 'all';
      selectedSubagent.value = null;

      currentTurnIndex.value = turn.id;

      // Wait for DOM to update and virtual scroller to re-calculate
      Vue.nextTick(() => {
        if (scrollerRef.value) {
          // Use turn.index (virtualIndex) to find the exact turn_start event
          const targetIndex = filteredEvents.value.findIndex(e =>
            e.virtualIndex === turn.index
          );

          if (targetIndex >= 0) {
            // DynamicScroller with variable heights needs multiple scroll passes
            // to converge on the correct position as it measures real item sizes
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
      const doScroll = (attempts) => {
        if (attempts <= 0 || !scrollerRef.value) return;
        scrollerRef.value.scrollToItem(0);
        setTimeout(() => doScroll(attempts - 1), 100);
      };
      doScroll(3);
    };

    const scrollToBottom = () => {
      if (!scrollerRef.value) return;
      const lastIndex = filteredEvents.value.length - 1;
      const doScroll = (attempts) => {
        if (attempts <= 0 || !scrollerRef.value) return;
        scrollerRef.value.scrollToItem(lastIndex);
        setTimeout(() => doScroll(attempts - 1), 100);
      };
      doScroll(5);
    };

    const jumpToTurn = (turnId) => {
      // Track turn click
      if (window.trackClick) {
        window.trackClick('TurnClicked', {
          turnNumber: turnId,
          sessionId: sessionId.value
        });
      }
      const turn = turns.value.find(t => t.id === turnId);
      if (turn) {
        // Update URL with eventType + eventName
        const eventName = `UserReq${turn.userReqNumber}_Turn${turn.id}`;
        const newUrl = `${window.location.pathname}?eventType=assistant.turn_start&eventName=${eventName}`;
        window.history.pushState({}, '', newUrl);

        // Scroll to turn
        scrollToTurn(turn);
      }
    };

    const repoBasename = (cwd) => {
      if (!cwd) return '';
      const parts = cwd.replace(/\/$/, '').split('/');
      return parts[parts.length - 1] || cwd;
    };

    const getTurnNumber = (virtualIndex) => {          // Find the turn with matching virtualIndex
      const turn = turns.value.find(t => t.index === virtualIndex);
      if (!turn) return '?';

      const turnLabel = turn.originalTurnId ?? turn.id;
      // Format: "UserReq N - Turn M" or just "Turn M" if no UserReq
      if (turn.userReqNumber > 0) {
        return `${turn.userReqNumber} - Turn ${turnLabel}`;
      }
      return `Turn ${turnLabel}`;
    };

    const getTurnDuration = (virtualIndex) => {
      const turn = turns.value.find(t => t.index === virtualIndex);
      return turn?.duration || null;
    };
    const escapeHtml = (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    const formatDateTime = (timestamp) => {
      if (!timestamp) return 'N/A';
      return new Date(timestamp).toLocaleString();
    };

    const exportSession = async () => {
      console.log('[Export] exportSession called');
      // Track export click
      if (window.trackClick) {
        window.trackClick('ExportClicked', {
          sessionId: sessionId.value
        });
      }
      exporting.value = true;
      try {
        console.log('[Export] Fetching:', `/session/${sessionId.value}/export`);
        const response = await fetch(`/session/${sessionId.value}/export`);
        console.log('[Export] Response received:', response.status, response.ok);
        console.log('[Export] Response received:', response.status, response.ok);
        if (!response.ok) {
          throw new Error('Share failed');
        }

        // Download the file
        console.log('[Export] Creating blob...');
        const blob = await response.blob();
        console.log('[Export] Blob size:', blob.size, 'type:', blob.type);
        const url = window.URL.createObjectURL(blob);
        console.log('[Export] Creating download link...');
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-${sessionId.value}.zip`;
        document.body.appendChild(a);
        a.click();
        console.log('[Export] Download triggered');
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Show success feedback
        console.log('[Export] Showing success feedback...');
        const originalText = '📤 Share Session';
        const successText = '✓ Downloaded!';
        const btn = document.querySelector('.export-btn');
        if (btn) {
          btn.textContent = successText;
          btn.style.background = '#238636';
          console.log('[Export] Button text updated to:', btn.textContent);
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
            console.log('[Export] Button text restored');
          }, 2000);
        }
      } catch (err) {
        console.error('[Export] Share session error:', err);
        alert('Failed to share session: ' + err.message);
      } finally {
        exporting.value = false;
        console.log('[Export] Export complete');
      }
    };

    const closeTypeFilter = (e) => {
      const dropdown = document.querySelector('.filter-type-wrapper');
      if (dropdown && !dropdown.contains(e.target)) {
        typeFilterOpen.value = false;
      }
    };

    const handleKeydown = (e) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        sidebarCollapsed.value = !sidebarCollapsed.value;
      }
    };

    onBeforeUnmount(() => {
      document.removeEventListener('click', closeTypeFilter);
      window.removeEventListener('keydown', handleKeydown);

      // Clear search timeout (memory leak fix)
      if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
      }

      // Clean scroll listeners
      if (scrollCleanup) {
        scrollCleanup();
        scrollCleanup = null;
      }

      // Clear expansion state (memory leak fix)
      expandedTools.value = {};
      expandedContent.value = {};

      // Clear markdown cache (memory leak fix)
      markdownCache.clear();
    });


    // Lifecycle
    onMounted(async () => {
      // Close type filter dropdown on outside click
      document.addEventListener('click', closeTypeFilter);

      // Load events asynchronously
      try {
        console.log('[Navigation] Starting event loading...');
        const response = await fetch(`/api/sessions/${sessionId.value}/events`);
        if (!response.ok) {
          throw new Error(`Failed to load events: ${response.statusText}`);
        }
        const data = await response.json();

        // Handle both old (array) and new (object with pagination) response formats
        if (Array.isArray(data)) {
          // Old format: direct array
          loadedEvents.value = data;
        } else if (data.events && Array.isArray(data.events)) {
          // New format: { events, pagination }
          loadedEvents.value = data.events;
          console.log('[Navigation] Pagination:', data.pagination);
        } else {
          throw new Error('Invalid response format');
        }

        console.log('[Navigation] Events loaded:', loadedEvents.value.length);

        // Update 'Updated' time from last event timestamp (more accurate than file mtime)
        if (loadedEvents.value.length > 0) {
          const lastEvent = loadedEvents.value[loadedEvents.value.length - 1];
          const lastTime = lastEvent.timestamp || lastEvent.time || lastEvent.data?.timestamp;
          if (lastTime) {
            metadata.value.updated = new Date(lastTime);
          }
        }

        // Check for URL query parameters and jump to event AFTER events are loaded
        const urlParams = new URLSearchParams(window.location.search);
        const eventTypeParam = urlParams.get('eventType');
        const eventNameParam = urlParams.get('eventName');
        const eventTimestampParam = urlParams.get('eventTimestamp');
        console.log('[Navigation] URL params:', eventTypeParam, eventNameParam, eventTimestampParam);

        if (eventTypeParam && eventNameParam) {
          console.log('[Navigation] Waiting for Vue to render...');
          // Wait for Vue to process the events and render
          Vue.nextTick(() => {
            console.log('[Navigation] nextTick - flatEvents count:', flatEvents.value?.length);
            let targetEvent = null;

            if (eventTypeParam === 'assistant.turn_start') {
              // Parse "UserReq1_Turn0" format
              const match = eventNameParam.match(/UserReq(\d+)_Turn(\d+)/);
              if (match) {
                const turnId = parseInt(match[2], 10);
                if (!isNaN(turnId)) {
                  console.log('[Navigation] Jumping to turn:', turnId);
                  jumpToTurn(turnId);
                  return;
                }
              }
            } else if (eventTypeParam === 'subagent.started') {
              console.log('[Navigation] Searching for subagent:', eventNameParam, 'timestamp:', eventTimestampParam);
              // Find subagent by name + timestamp (handles duplicate subagent names)
              if (eventTimestampParam) {
                targetEvent = flatEvents.value.find(event =>
                  event.type === 'subagent.started' &&
                  event.timestamp === eventTimestampParam
                );
              }
              // Fallback: match by name only (for links without timestamp)
              if (!targetEvent) {
                targetEvent = flatEvents.value.find(event =>
                  event.type === 'subagent.started' &&
                  (event.data?.agentDisplayName === eventNameParam ||
                   event.data?.agentName === eventNameParam ||
                   event.data?.label === eventNameParam)
                );
              }
              console.log('[Navigation] Target event found:', targetEvent ? 'YES' : 'NO', 'virtualIndex:', targetEvent?.virtualIndex);
            } else {
              // Generic: match by type only
              targetEvent = flatEvents.value.find(event => event.type === eventTypeParam);
            }

            if (targetEvent) {
              // Find target in filteredEvents (which may be different from flatEvents due to filters)
              const targetIndex = filteredEvents.value.findIndex(e =>
                e.virtualIndex === targetEvent.virtualIndex
              );
              console.log('[Navigation] Target in filteredEvents at index:', targetIndex);

              if (targetIndex >= 0 && scrollerRef.value) {
                console.log('[Navigation] Scrolling to index:', targetIndex);
                // Use retry mechanism like scrollToTurn
                const doScroll = (attempts) => {
                  if (attempts <= 0 || !scrollerRef.value) return;
                  scrollerRef.value.scrollToItem(targetIndex);
                  setTimeout(() => doScroll(attempts - 1), 100);
                };
                setTimeout(() => doScroll(3), 50);
              } else {
                console.log('[Navigation] Failed - targetIndex:', targetIndex, 'scrollerRef:', !!scrollerRef.value);
              }
            } else {
              console.log('[Navigation] Target event not found');
            }
          });
        }
      } catch (error) {
        console.error('Error loading events:', error);
        eventsError.value = error.message;
      } finally {
        eventsLoading.value = false;
      }

      window.addEventListener('keydown', handleKeydown);

      if (window.marked) {
        marked.setOptions({
          breaks: true,
          gfm: true
        });
      }

      // 监听滚动事件来更新 visibleRange
      const updateVisibleRange = () => {
        if (!scrollerRef.value) return;

        // 尝试多种方式访问 scroller 元素
        let scroller = null;
        if (scrollerRef.value.$el && typeof scrollerRef.value.$el.querySelector === 'function') {
          scroller = scrollerRef.value.$el.querySelector('.vue-recycle-scroller');
        } else if (scrollerRef.value.querySelector && typeof scrollerRef.value.querySelector === 'function') {
          scroller = scrollerRef.value.querySelector('.vue-recycle-scroller');
        }

        if (!scroller) {
          // 如果还找不到，直接查询 DOM
          scroller = document.querySelector('.vue-recycle-scroller');
        }

        if (scroller) {
          const scrollTop = scroller.scrollTop;
          const clientHeight = scroller.clientHeight;

          // 估算可见范围
          const avgItemHeight = 80;
          const startIndex = Math.floor(scrollTop / avgItemHeight);
          const visibleCount = Math.ceil(clientHeight / avgItemHeight);
          const endIndex = Math.min(startIndex + visibleCount, filteredEvents.value.length);

          const startPos = Math.max(1, startIndex + 1);
          const endPos = Math.max(1, endIndex);

          visibleRange.value = {
            start: Math.min(startPos, endPos), // Ensure start <= end
            end: endPos
          };
        }
      };

      // 初始更新和添加滚动监听
      setTimeout(() => {
        updateVisibleRange();

        const scroller = document.querySelector('.vue-recycle-scroller');
        if (scroller) {
          scroller.addEventListener('scroll', updateVisibleRange);
          // Store cleanup function
          scrollCleanup = () => {
            scroller.removeEventListener('scroll', updateVisibleRange);
          };
        }
      }, 500);

    });

    // Session Tags
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

    // Format large numbers as "105K", "29K" etc
    const formatTokens = (num) => {
      if (!num || num === 0) return '0';
      if (num < 1000) return num.toString();
      return Math.floor(num / 1000) + 'K';
    };

    // Format duration as "12.5s", "3m 45s" etc
    const formatDuration = (ms) => {
      if (!ms || ms === 0) return '0s';
      const seconds = Math.floor(ms / 1000);
      if (seconds < 60) return (ms / 1000).toFixed(1) + 's';
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    };

    // Calculate total tokens across all models
    const totalTokens = computed(() => {
      if (!metadata.value.usage || !metadata.value.usage.modelMetrics) return 0;
      let total = 0;
      for (const model in metadata.value.usage.modelMetrics) {
        const usage = metadata.value.usage.modelMetrics[model].usage;
        if (usage) {
          total += (usage.inputTokens || 0) + (usage.outputTokens || 0);
        }
      }
      return total;
    });

    // Calculate total requests
    const totalRequests = computed(() => {
      if (!metadata.value.usage || !metadata.value.usage.modelMetrics) return 0;
      let total = 0;
      for (const model in metadata.value.usage.modelMetrics) {
        total += (metadata.value.usage.modelMetrics[model].requests?.count || 0);
      }
      return total;
    });

    const totalModels = computed(() => {
      if (!metadata.value.usage || !metadata.value.usage.modelMetrics) return 0;
      return Object.keys(metadata.value.usage.modelMetrics).length;
    });

    // Calculate cache hit ratio per model
    const getModelCacheHitRatio = (model) => {
      const metrics = metadata.value.usage?.modelMetrics[model];
      if (!metrics || !metrics.usage) return null;
      return getUsageCacheHitRatio(metrics.usage);
    };

    const getDisplayUsageInputTokens = (model) => {
      const metrics = metadata.value.usage?.modelMetrics[model];
      if (!metrics || !metrics.usage) return 0;
      return getDisplayInputTokens(metrics.usage);
    };

    // Tool calling summary: count tool calls by name, sorted descending by count
    const toolCallingSummary = computed(() => {
      const countMap = new Map();
      for (const event of flatEvents.value) {
        if (event.data?.tools && Array.isArray(event.data.tools)) {
          for (const tool of event.data.tools) {
            if (tool && tool.name) {
              countMap.set(tool.name, (countMap.get(tool.name) || 0) + 1);
            }
          }
        }
      }
      return Array.from(countMap, ([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    });

    // Format cost as premium request count
    const formatCost = (cost) => {
      if (cost === undefined || cost === null) return '';
      return cost + ' premium';
    };

    // Tag colors (6 colors cycling based on hash)
    const tagColors = [
      '#3b82f6', // blue
      '#10b981', // green
      '#f59e0b', // amber
      '#ef4444', // red
      '#8b5cf6', // purple
      '#ec4899', // pink
      '#06b6d4', // cyan
      '#f97316'  // orange
    ];

    const getTagColor = (tag) => {
      let hash = 0;
      for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
      }
      return tagColors[Math.abs(hash) % tagColors.length];
    };

    const loadTags = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId.value}/tags`);
        if (response.ok) {
          const data = await response.json();
          sessionTags.value = data.tags || [];
        }
      } catch (err) {
        console.error('Error loading tags:', err);
      }
    };

    const loadAllTags = async () => {
      try {
        const response = await fetch('/api/tags');
        if (response.ok) {
          const data = await response.json();
          allTags.value = data.tags || [];
        }
      } catch (err) {
        console.error('Error loading all tags:', err);
      }
    };

    const saveTags = async (tags) => {
      try {
        // Track tag changes
        if (window.trackClick) {
          const addedTags = tags.filter(tag => !sessionTags.value.includes(tag));
          addedTags.forEach(tag => {
            window.trackClick('TagAdded', {
              sessionId: sessionId.value,
              tag: tag
            });
          });
        }
        const response = await fetch(`/api/sessions/${sessionId.value}/tags`, {
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
        console.error('Error saving tags:', err);
        tagsError.value = 'Network error';
        return false;
      }
    };

    const startEditTags = () => {
      editingTags.value = [...sessionTags.value];
      tagsEditing.value = true;
      tagsError.value = '';
      setTimeout(() => {
        if (tagInputRef.value) {
          tagInputRef.value.focus();
        }
      }, 10);
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

      if (tag.length > 30) {
        tagsError.value = 'Tag must be 30 characters or less';
        return;
      }

      if (editingTags.value.length >= 10) {
        tagsError.value = 'Maximum 10 tags per session';
        return;
      }

      if (editingTags.value.includes(tag)) {
        tagsError.value = 'Tag already added';
        tagInputValue.value = '';
        return;
      }

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
      if (!input) {
        showAutocomplete.value = false;
        autocompleteOptions.value = [];
        return;
      }

      const filtered = allTags.value
        .filter(tag =>
          tag.toLowerCase().includes(input) &&
          !editingTags.value.includes(tag)
        )
        .slice(0, 5);

      if (filtered.length > 0) {
        showAutocomplete.value = true;
        autocompleteOptions.value = filtered;
        autocompleteSelectedIndex.value = 0;
      } else {
        showAutocomplete.value = false;
        autocompleteOptions.value = [];
      }
    };

    const selectAutocompleteOption = (option) => {
      tagInputValue.value = option;
      addTag();
    };

    const saveTagsOnBlur = async () => {
      // Small delay to allow click events on autocomplete
      setTimeout(async () => {
        if (!tagsEditing.value) return;

        const success = await saveTags(editingTags.value);
        if (success) {
          tagsEditing.value = false;
          editingTags.value = [];
          tagInputValue.value = '';
          showAutocomplete.value = false;
          // Reload all tags for autocomplete
          await loadAllTags();
        }
      }, 200);
    };

    // Load tags on mount
    onMounted(async () => {
      await loadTags();
      await loadAllTags();
    });

    return {
      sessionId,
      metadata,
      exporting,
      sidebarCollapsed,
      expandedTools,
      expandedContent,
      expansionCount,
      currentFilter,
      searchText,
      currentTurnIndex,
      scrollerRef,
      visibleRange,
      loadedEvents,
      eventsLoading,
      eventsError,
      flatEvents,
      filteredEvents,
      eventCounts,
      filters,
      turns,
      userReqs,
      truncateText,
      formatTime,
      formatToolTime,
      formatDateTime,
      renderMarkdown,
      highlightSearchText,
      toggleTool,
      toggleContent,
      isContentTooLong,
      truncateContent,
      getBadgeInfo,
      getToolStatus,
      getToolErrorMessage,
      getToolDuration,
      getToolCommand,
      hasTools,
      getToolGroups,
      getSubagentInfo,
      getSubagentColor,
      setFilter,
      selectSubagent,
      selectedSubagent,
      subagentList,
      subagentTokenUsage,
      SUBAGENT_COLORS,
      typeFilterOpen,
      activeFilterCount,
      clearAllFilters,
      scrollToTurn,
      scrollToTop,
      scrollToBottom,
      jumpToTurn,
      getTurnNumber,
      getTurnDuration,
      repoBasename,
      escapeHtml,
      exportSession,
      searchResultCount,
      // Tags
      sessionTags,
      allTags,
      tagsEditing,
      editingTags,
      tagInputValue,
      tagInputRef,
      tagsError,
      showAutocomplete,
      autocompleteOptions,
      autocompleteSelectedIndex,
      getTagColor,
      startEditTags,
      cancelEditTags,
      addTag,
      removeTagFromEdit,
      updateAutocomplete,
      selectAutocompleteOption,
      saveTagsOnBlur,
      // Usage
      formatTokens,
      formatDuration,
      formatCost,
      totalTokens,
      totalRequests,
      totalModels,
      getDisplayUsageInputTokens,
      getModelCacheHitRatio,
      toolCallingSummary
    };
  },

  template: `
    <div class="container">
      <div class="header">
        <a href="/" class="home-btn">← Back to Home</a>
        <h1>📋 Session: {{ sessionId }}
          <span v-if="metadata.sessionStatus === 'wip'" style="font-size: 12px; padding: 2px 8px; border-radius: 3px; background: rgba(210, 153, 34, 0.2); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); vertical-align: middle; margin-left: 8px;">🔄 WIP</span>
        </h1>
        <div style="display: flex; gap: 10px;">
          <a :href="'/session/' + sessionId + '/time-analyze'" class="time-analyze-btn" @click="trackClick && trackClick('TimeAnalyzeClicked', { sessionId: sessionId })">⏱ Analysis</a>
          <button @click="exportSession" class="export-btn" :disabled="exporting">
            {{ exporting ? '⏳ Sharing...' : '📤 Share Session' }}
          </button>
        </div>
      </div>

      <div class="main-layout">
        <!-- Mobile overlay backdrop -->
        <div
          v-if="!sidebarCollapsed"
          @click="sidebarCollapsed = true"
          class="sidebar-backdrop"
        ></div>
        <div :class="['sidebar', { collapsed: sidebarCollapsed }]">
          <div class="sidebar-section">
            <div class="sidebar-section-title">Session Info</div>
            <div class="session-info">
              <table class="session-info-table">
                <tbody>
                  <tr v-if="metadata.source">
                    <td>Source</td>
                    <td>
                      <!-- Use backend-provided source metadata (Violation #3 fix) -->
                      <span :class="['source-badge', metadata.sourceBadgeClass || 'source-copilot']">
                        {{ metadata.sourceName || 'GitHub Copilot' }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="metadata.modernizeVersion">
                    <td>Version</td>
                    <td>{{ metadata.modernizeVersion }}</td>
                  </tr>
                  <tr v-if="metadata.source === 'modernize' && metadata.copilotVersion">
                    <td>Copilot SDK</td>
                    <td>{{ metadata.copilotVersion }}</td>
                  </tr>
                  <tr v-if="metadata.copilotVersion && metadata.source !== 'modernize'">
                    <td>Version</td>
                    <td>{{ metadata.copilotVersion }}</td>
                  </tr>
                  <tr v-if="metadata.model">
                    <td>Model</td>
                    <td>{{ metadata.model }}</td>
                  </tr>
                  <tr v-if="metadata.repo">
                    <td>Repo</td>
                    <td>{{ metadata.repo }}</td>
                  </tr>
                  <tr v-if="metadata.branch">
                    <td>Branch</td>
                    <td>{{ metadata.branch }}</td>
                  </tr>
                  <tr v-if="metadata.cwd && !metadata.repo">
                    <td>Repo</td>
                    <td>{{ metadata.cwd }}</td>
                  </tr>
                  <tr v-if="metadata.created">
                    <td>Created</td>
                    <td>{{ formatDateTime(metadata.created) }}</td>
                  </tr>
                  <tr v-if="metadata.updated">
                    <td>Updated</td>
                    <td>{{ formatDateTime(metadata.updated) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Usage Section -->
          <div v-if="metadata.usage" class="sidebar-section">
            <div class="sidebar-section-title">Token Usage</div>
            <div class="usage-container">
              <div class="usage-summary">
                <div class="usage-summary-eyebrow">Overview</div>
                <div class="usage-summary-total">
                  {{ formatTokens(totalTokens) }} <span class="usage-summary-total-unit">tokens</span>
                </div>
                <div class="usage-summary-caption">
                  Usage captured across {{ totalModels }} model{{ totalModels === 1 ? '' : 's' }}
                </div>
                <div class="usage-summary-metrics">
                  <div class="usage-metric-card usage-metric-card-summary">
                    <span class="usage-metric-label">Requests</span>
                    <span class="usage-metric-value">{{ totalRequests }} reqs</span>
                  </div>
                  <div class="usage-metric-card usage-metric-card-summary">
                    <span class="usage-metric-label">Models</span>
                    <span class="usage-metric-value">{{ totalModels }}</span>
                  </div>
                  <div class="usage-metric-card usage-metric-card-summary">
                    <span class="usage-metric-label">API Time</span>
                    <span class="usage-metric-value">{{ formatDuration(metadata.usage.totalApiDurationMs) }}</span>
                  </div>
                </div>
              </div>

              <div class="usage-expanded">
                <!-- Model breakdown -->
                <div v-if="Object.keys(metadata.usage.modelMetrics).length > 0" class="usage-section">
                  <div class="usage-section-header">
                    <div class="usage-section-title">Models</div>
                    <div class="usage-section-badge">{{ totalModels }}</div>
                  </div>
                  <div class="usage-model-list">
                    <div v-for="(metrics, model) in metadata.usage.modelMetrics" :key="model" class="usage-model">
                      <div class="usage-model-header">
                        <div class="usage-model-name" :title="model">{{ model }}</div>
                        <div class="usage-model-meta">
                          <span class="usage-meta-pill">{{ metrics.requests?.count || 0 }} reqs</span>
                          <span v-if="metrics.requests?.cost" class="usage-meta-pill usage-meta-pill-premium">{{ formatCost(metrics.requests.cost) }}</span>
                          <span v-if="getModelCacheHitRatio(model) !== null" class="usage-meta-pill usage-meta-pill-cache">{{ getModelCacheHitRatio(model) }}% cache</span>
                        </div>
                      </div>
                      <div v-if="metrics.usage" class="usage-metric-grid">
                        <div class="usage-metric-card">
                          <span class="usage-metric-label">Input</span>
                          <span class="usage-metric-value">{{ formatTokens(getDisplayUsageInputTokens(model)) }}</span>
                        </div>
                        <div class="usage-metric-card">
                          <span class="usage-metric-label">Output</span>
                          <span class="usage-metric-value">{{ formatTokens(metrics.usage.outputTokens || 0) }}</span>
                        </div>
                        <div v-if="metrics.usage?.cacheReadTokens" class="usage-metric-card">
                          <span class="usage-metric-label">Cache Read</span>
                          <span class="usage-metric-value">{{ formatTokens(metrics.usage.cacheReadTokens) }}</span>
                        </div>
                        <div v-if="metrics.usage?.cacheWriteTokens" class="usage-metric-card">
                          <span class="usage-metric-label">Cache Write</span>
                          <span class="usage-metric-value">{{ formatTokens(metrics.usage.cacheWriteTokens) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Context window breakdown -->
                <div v-if="metadata.usage.currentTokens || metadata.usage.systemTokens || metadata.usage.conversationTokens || metadata.usage.toolDefinitionsTokens" class="usage-section">
                  <div class="usage-section-header">
                    <div class="usage-section-title">Context Window</div>
                  </div>
                  <div class="usage-metric-grid">
                    <div v-if="metadata.usage.currentTokens" class="usage-metric-card">
                      <span class="usage-metric-label">Current</span>
                      <span class="usage-metric-value">{{ formatTokens(metadata.usage.currentTokens) }}</span>
                    </div>
                    <div v-if="metadata.usage.systemTokens" class="usage-metric-card">
                      <span class="usage-metric-label">System</span>
                      <span class="usage-metric-value">{{ formatTokens(metadata.usage.systemTokens) }}</span>
                    </div>
                    <div v-if="metadata.usage.conversationTokens" class="usage-metric-card">
                      <span class="usage-metric-label">Conversation</span>
                      <span class="usage-metric-value">{{ formatTokens(metadata.usage.conversationTokens) }}</span>
                    </div>
                    <div v-if="metadata.usage.toolDefinitionsTokens" class="usage-metric-card">
                      <span class="usage-metric-label">Tools</span>
                      <span class="usage-metric-value">{{ formatTokens(metadata.usage.toolDefinitionsTokens) }}</span>
                    </div>
                  </div>
                </div>

                <!-- Code changes -->
                <div v-if="metadata.usage.codeChanges && (metadata.usage.codeChanges.linesAdded > 0 || metadata.usage.codeChanges.linesRemoved > 0)" class="usage-section">
                  <div class="usage-section-header">
                    <div class="usage-section-title">Code Changes</div>
                  </div>
                  <div class="usage-metric-grid usage-metric-grid-compact">
                    <div class="usage-metric-card">
                      <span class="usage-metric-label">Added</span>
                      <span class="usage-metric-value usage-metric-value-added">+{{ metadata.usage.codeChanges.linesAdded }}</span>
                    </div>
                    <div class="usage-metric-card">
                      <span class="usage-metric-label">Removed</span>
                      <span class="usage-metric-value usage-metric-value-removed">-{{ metadata.usage.codeChanges.linesRemoved }}</span>
                    </div>
                    <div class="usage-metric-card">
                      <span class="usage-metric-label">Files</span>
                      <span class="usage-metric-value">{{ metadata.usage.codeChanges.filesModified?.length || 0 }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Tool Calling Summary -->
          <div v-if="toolCallingSummary.length" class="sidebar-section">
            <div class="sidebar-section-title">Tool Calls</div>
            <div class="tool-summary-list">
              <div v-for="item in toolCallingSummary" :key="item.name" class="tool-summary-item">
                <div class="tool-summary-bar" :style="{ width: (item.count / toolCallingSummary[0].count * 100) + '%' }"></div>
                <span class="tool-summary-name" :title="item.name">{{ item.name }}</span>
                <span class="tool-summary-count">{{ item.count }}</span>
              </div>
            </div>
          </div>

          <!-- Session Tags -->
          <div class="sidebar-section session-tags-container">
            <div class="sidebar-section-title">Tags</div>
            <div v-if="!tagsEditing" class="tags-display">
              <span
                v-for="tag in sessionTags"
                :key="tag"
                class="tag-label"
                :style="{ backgroundColor: getTagColor(tag) }"
              >
                {{ tag }}
              </span>
              <button class="tags-edit-btn" @click="startEditTags" title="Edit tags">
                ✏️
              </button>
            </div>
            <div v-else class="tags-dropdown">
              <div class="tags-input-container">
                <span
                  v-for="tag in editingTags"
                  :key="tag"
                  class="tag-input-chip"
                  :style="{ backgroundColor: getTagColor(tag) }"
                >
                  {{ tag }}
                  <button @click="removeTagFromEdit(tag)" title="Remove tag">×</button>
                </span>
                <input
                  ref="tagInputRef"
                  v-model="tagInputValue"
                  @keydown.enter.prevent="addTag"
                  @keydown.escape="cancelEditTags"
                  @blur="saveTagsOnBlur"
                  @input="updateAutocomplete"
                  class="tags-text-input"
                  placeholder="Type tag name..."
                  maxlength="30"
                />
              </div>
              <div v-if="showAutocomplete && autocompleteOptions.length > 0" class="tags-autocomplete">
                <div
                  v-for="(option, index) in autocompleteOptions"
                  :key="option"
                  :class="['tags-autocomplete-item', { selected: index === autocompleteSelectedIndex }]"
                  @click="selectAutocompleteOption(option)"
                  @mouseenter="autocompleteSelectedIndex = index"
                >
                  {{ option }}
                </div>
              </div>
              <div v-if="tagsError" class="tags-error">{{ tagsError }}</div>
            </div>
          </div>
        </div>

        <div class="content">
          <div class="unified-filter-bar">
            <div class="filter-bar-row">
              <button
                class="sidebar-toggle"
                @click="() => { sidebarCollapsed = !sidebarCollapsed; trackClick && trackClick('SidebarToggled', { state: sidebarCollapsed ? 'open' : 'collapsed', sessionId: sessionId }); }"
                :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
              >
                ☰
              </button>

              <div class="filter-bar-search">
                <input
                  v-model="searchText"
                  type="text"
                  placeholder="🔍 Search events..."
                  class="search-input"
                />
                <span v-if="searchResultCount" class="search-result-count">
                  {{ searchResultCount }}
                </span>
              </div>

              <div class="filter-bar-divider"></div>

              <!-- Turn dropdown with optgroup -->
              <select
                v-if="turns.length > 0"
                v-model="currentTurnIndex"
                @change="jumpToTurn(currentTurnIndex)"
                class="turn-dropdown"
              >
                <optgroup
                  v-for="req in userReqs"
                  :key="req.reqNumber"
                  :label="req.reqNumber > 0 ? 'UserReq ' + req.reqNumber + ': ' + truncateText(req.message, 40) : 'Setup'"
                >
                  <option v-for="turn in req.turns" :key="turn.id" :value="turn.id">
                    Turn {{ turn.originalTurnId ?? turn.id }} ({{ turn.duration }})
                  </option>
                </optgroup>
              </select>

              <div class="filter-bar-divider"></div>

              <!-- Subagent selector -->
              <div v-if="subagentList.length > 0" class="subagent-selector">
                <select
                  :value="selectedSubagent || ''"
                  @change="selectSubagent($event.target.value || null)"
                  class="subagent-dropdown"
                >
                  <option value="">🤖 All Agents</option>
                  <option v-for="sa in subagentList" :key="sa.toolCallId" :value="sa.toolCallId">
                    🤖 {{ sa.name }}
                  </option>
                </select>
                <span v-if="subagentTokenUsage" class="subagent-usage-badge">
                  {{ subagentTokenUsage.eventCount }} events · {{ formatDuration(subagentTokenUsage.durationMs) }}
                </span>
              </div>

              <div class="filter-bar-divider"></div>

              <!-- Event type dropdown -->
              <div class="filter-type-wrapper">
                <button
                  class="filter-type-toggle"
                  :class="{ active: currentFilter !== 'all' }"
                  @click.stop="typeFilterOpen = !typeFilterOpen"
                >
                  ⚡ {{ currentFilter === 'all' ? 'All Types' : currentFilter }} ▾
                </button>
                <div v-if="typeFilterOpen" class="filter-type-menu">
                  <div class="filter-type-menu-header">Event Types</div>
                  <div class="filter-type-menu-options">
                    <div
                      v-for="filter in filters"
                      :key="filter.type"
                      :class="['filter-type-menu-item', { active: currentFilter === filter.type }]"
                      @click="setFilter(filter.type); typeFilterOpen = false"
                    >
                      <span class="filter-type-menu-label">{{ filter.type === 'all' ? 'All' : filter.type }}</span>
                      <span class="filter-type-menu-count">{{ filter.count }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Active filter chips -->
            <div v-if="activeFilterCount > 0" class="active-filters-bar">
              <span v-if="currentFilter !== 'all'" class="filter-chip">
                Type: {{ currentFilter }}
                <button @click="setFilter('all')" class="filter-chip-remove" title="Remove filter">×</button>
              </span>
              <span v-if="selectedSubagent" class="filter-chip">
                Agent: {{ subagentList.find(s => s.toolCallId === selectedSubagent)?.name || selectedSubagent }}
                <button @click="selectSubagent(null)" class="filter-chip-remove" title="Remove filter">×</button>
              </span>
              <span v-if="searchText.trim()" class="filter-chip">
                Search: "{{ searchText.length > 20 ? searchText.substring(0, 20) + '…' : searchText }}"
                <button @click="searchText = ''" class="filter-chip-remove" title="Remove filter">×</button>
              </span>
              <button class="clear-all-filters-btn" @click="clearAllFilters">Clear all</button>
            </div>
          </div>

          <!-- Loading state -->
          <div v-if="eventsLoading" class="loading-message">
            <div style="text-align: center; padding: 40px; color: #c9d1d9;">
              ⏳ Loading events...
            </div>
          </div>

          <!-- Error state -->
          <div v-else-if="eventsError" class="error-message">
            <div style="text-align: center; padding: 40px; color: #f85149;">
              ❌ Error loading events: {{ eventsError }}
            </div>
          </div>

          <!-- Events list -->
          <DynamicScroller
            v-else
            ref="scrollerRef"
            :items="filteredEvents"
            :min-item-size="80"
            :prerender="10"
            key-field="stableId"
            class="scroller"
          >
            <template #default="{ item, index, active }">
              <DynamicScrollerItem
                :item="item"
                :active="active"
                :size-dependencies="[expansionCount]"
                :data-index="index"
              >
                <!-- Turn Start Divider -->
                <div
                  v-if="item.type === 'assistant.turn_start'"
                  :data-type="item.type"
                  :data-index="item.virtualIndex"
                  class="turn-divider"
                >
                  <div class="turn-divider-line-left"></div>
                  <span class="turn-divider-text">
                    UserReq {{ getTurnNumber(item.virtualIndex) }}
                    <template v-if="metadata.source === 'vscode'">
                      <span class="turn-time">{{ formatTime(item.timestamp) }}</span>
                      <span v-if="getTurnDuration(item.virtualIndex)" class="turn-duration">{{ getTurnDuration(item.virtualIndex) }}</span>
                    </template>
                    <template v-else>Start</template>
                  </span>
                  <div class="turn-divider-line-right"></div>
                  <div class="divider-separator"></div>
                </div>

                <!-- Subagent Divider -->
                <div
                  v-else-if="item.type === 'subagent.started' || item.type === 'subagent.completed' || item.type === 'subagent.failed'"
                  :data-type="item.type"
                  :data-index="item.virtualIndex"
                  :class="['subagent-divider', item.type.split('.')[1]]"
                  :style="{
                    '--sa-color': getSubagentColor(item) || '#58a6ff'
                  }"
                >
                  <div class="subagent-divider-line-left" :style="{ background: getSubagentColor(item) || '#58a6ff' }"></div>
                  <span class="subagent-divider-text" :style="{ color: getSubagentColor(item) || '#58a6ff', borderColor: getSubagentColor(item) || '#58a6ff', background: (getSubagentColor(item) || '#58a6ff') + '1a' }">
                    🤖 {{ item.data?.agentDisplayName || item.data?.agentName || 'SubAgent' }}
                    {{ item.type === 'subagent.started' ? 'Start ▶' : item.type === 'subagent.completed' ? 'Complete ✓' : 'Failed ✗' }}
                  </span>
                  <div class="subagent-divider-line-right" :style="{ background: getSubagentColor(item) || '#58a6ff' }"></div>
                  <div class="divider-separator"></div>
                </div>

                <!-- Regular Event -->
                <div
                  v-else
                  :class="['event', getSubagentInfo(item) ? 'event-in-subagent' : '']"
                  :data-type="item.type"
                  :data-index="item.virtualIndex"
                  :style="getSubagentColor(item) ? { '--subagent-border-color': getSubagentColor(item) } : {}"
                >
                  <div class="event-header">
                    <span :class="['event-badge', getBadgeInfo(item.type, item).class]">
                      {{ getBadgeInfo(item.type, item).label }}
                    </span>
                    <span
                      v-if="getSubagentInfo(item)"
                      class="subagent-owner-tag"
                      :style="{ '--subagent-color': getSubagentColor(item) || '#58a6ff', '--subagent-hover-bg': ((getSubagentColor(item) || '#58a6ff') + '26') }"
                      :title="'Filter to ' + getSubagentInfo(item).name"
                      @click.stop="selectSubagent(getSubagentInfo(item).toolCallId)"
                    >🤖 {{ getSubagentInfo(item).name }}</span>
                    <span v-if="metadata.source !== 'vscode'" class="event-timestamp">{{ formatTime(item.timestamp) }}</span>
                  </div>

                  <!-- Abort event: show reason -->
                  <div v-if="item.type === 'abort' && item.data?.reason" class="event-content">
                    <strong>Reason:</strong> {{ item.data.reason }}
                  </div>

                  <!-- Session start: show type and selectedModel -->
                  <div v-else-if="item.type === 'session.start'" class="event-content">
                    <div v-if="item.data?.type"><strong>Type:</strong> {{ item.data.type }}</div>
                    <div v-if="item.data?.selectedModel"><strong>Model:</strong> {{ item.data.selectedModel }}</div>
                    <div v-if="item.data?.producer"><strong>Producer:</strong> {{ item.data.producer }}</div>
                  </div>

                  <!-- Session resume: show resumeTime, eventCount, context -->
                  <div v-else-if="item.type === 'session.resume'" class="event-content">
                    <div v-if="item.data?.resumeTime"><strong>Resume Time:</strong> {{ formatDateTime(item.data.resumeTime) }}</div>
                    <div v-if="item.data?.eventCount"><strong>Event Count:</strong> {{ item.data.eventCount }}</div>
                    <div v-if="item.data?.context?.branch"><strong>Branch:</strong> {{ item.data.context.branch }}</div>
                    <div v-if="item.data?.context?.repository"><strong>Repository:</strong> {{ item.data.context.repository }}</div>
                    <div v-if="item.data?.context?.cwd"><strong>Working Directory:</strong> {{ item.data.context.cwd }}</div>
                  </div>

                  <!-- Session error: show errorType + message -->
                  <div v-else-if="item.type === 'session.error' && (item.data?.errorType || item.data?.message)" class="event-content">
                    <div v-if="item.data?.errorType"><strong>Error Type:</strong> {{ item.data.errorType }}</div>
                    <div v-if="item.data?.message"><strong>Message:</strong> {{ item.data.message }}</div>
                  </div>

                  <!-- Model change: show previousModel → newModel -->
                  <div v-else-if="item.type === 'session.model_change'" class="event-content model-change-content">
                    <div v-if="item.data?.previousModel && item.data?.newModel" class="model-change-text">
                      <span class="model-name">{{ item.data.previousModel }}</span>
                      <span class="model-arrow">→</span>
                      <span class="model-name">{{ item.data.newModel }}</span>
                    </div>
                    <div v-else-if="item.data?.newModel" class="model-change-text">
                      Switched to <span class="model-name">{{ item.data.newModel }}</span>
                    </div>
                    <div v-else-if="item.data?.model" class="model-change-text">
                      Switched to <span class="model-name">{{ item.data.model }}</span>
                    </div>
                    <div v-else class="model-change-text">
                      Model changed
                    </div>
                  </div>

                  <!-- Session truncation: show token/message removal info -->
                  <div v-else-if="item.type === 'system.notification'" class="event-content" style="opacity:0.7">
                    <span>{{ item.data?.message }}</span>
                  </div>

                  <div v-else-if="item.type === 'session.truncation'" class="event-content">
                    <div v-if="item.data?.messagesRemovedDuringTruncation"><strong>Messages removed:</strong> {{ item.data.messagesRemovedDuringTruncation }}</div>
                    <div v-if="item.data?.tokensRemovedDuringTruncation"><strong>Tokens removed:</strong> {{ item.data.tokensRemovedDuringTruncation.toLocaleString() }}</div>
                    <div v-if="item.data?.preTruncationTokensInMessages"><strong>Pre-truncation tokens:</strong> {{ item.data.preTruncationTokensInMessages.toLocaleString() }}</div>
                    <div v-if="item.data?.postTruncationMessagesLength"><strong>Post-truncation messages:</strong> {{ item.data.postTruncationMessagesLength }}</div>
                    <div v-if="item.data?.performedBy"><strong>Performed by:</strong> {{ item.data.performedBy }}</div>
                  </div>

                  <!-- Session compaction start -->
                  <div v-else-if="item.type === 'session.compaction_start'" class="event-content">
                    Context compaction started
                  </div>

                  <!-- Session compaction complete: show results -->
                  <div v-else-if="item.type === 'session.compaction_complete'" class="event-content">
                    <div v-if="item.data?.success != null"><strong>Success:</strong> {{ item.data.success ? '✓' : '✗' }}</div>
                    <div v-if="item.data?.compactionTokensUsed">
                      <strong>Tokens used:</strong>
                      input {{ item.data.compactionTokensUsed.input?.toLocaleString() || 0 }},
                      output {{ item.data.compactionTokensUsed.output?.toLocaleString() || 0 }}
                      <span v-if="item.data.compactionTokensUsed.cachedInput">, cached {{ item.data.compactionTokensUsed.cachedInput.toLocaleString() }}</span>
                    </div>
                    <div v-if="item.data?.preCompactionMessagesLength"><strong>Pre-compaction messages:</strong> {{ item.data.preCompactionMessagesLength }}</div>
                    <div v-if="item.data?.preCompactionTokens"><strong>Pre-compaction tokens:</strong> {{ item.data.preCompactionTokens.toLocaleString() }}</div>
                    <div v-if="item.data?.summaryContent" style="margin-top: 8px;">
                      <button
                        @click="toggleContent('compaction-' + item.stableId)"
                        style="background: none; border: 1px solid #30363d; color: #58a6ff; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;"
                      >
                        {{ expandedContent['compaction-' + item.stableId] ? 'Hide summary ▲' : 'Show summary ▼' }}
                      </button>
                      <div v-if="expandedContent['compaction-' + item.stableId]" class="event-content" style="margin-top: 8px;" v-html="renderMarkdown(item.data.summaryContent)"></div>
                    </div>
                  </div>

                  <!-- Regular content (unified format from server) -->
                  <div v-else-if="item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent">
                    <div
                      class="event-content"
                      v-html="highlightSearchText(
                        renderMarkdown(
                          (expandedContent[item.stableId] || !isContentTooLong(item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent))
                            ? (item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent)
                            : truncateContent(item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent)
                        ),
                        searchText
                      )"
                    ></div>
                    <div
                      v-if="isContentTooLong(item.data?.message || item.data?.text || item.data?.content || item.data?.transformedContent)"
                      style="margin-top: 8px;"
                    >
                      <button
                        @click="toggleContent(item.stableId)"
                        :data-content-id="item.stableId"
                        style="background: none; border: 1px solid #30363d; color: #58a6ff; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;"
                      >
                        {{ expandedContent[item.stableId] ? 'Show less ▲' : 'Show more ▼' }}
                      </button>
                    </div>
                  </div>

                  <!-- No content at all (no message and no tools) -->
                  <div v-else-if="!hasTools(item) && !item.data?.reasoningText" class="event-content" style="color: #7d8590; font-style: italic;">
                    No available message
                  </div>

                  <!-- Reasoning text (shown after main content, before tool calls) -->
                  <div v-if="item.data?.reasoningText" class="event-content reasoning-text-content">
                    <div
                      v-html="highlightSearchText(
                        renderMarkdown(
                          (expandedContent[item.stableId + '-reasoning'] || !isContentTooLong(item.data.reasoningText))
                            ? item.data.reasoningText
                            : truncateContent(item.data.reasoningText)
                        ),
                        searchText
                      )"
                    ></div>
                    <div v-if="isContentTooLong(item.data.reasoningText)" style="margin-top: 8px;">
                      <button
                        @click="toggleContent(item.stableId + '-reasoning')"
                        style="background: none; border: 1px solid #30363d; color: #58a6ff; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;"
                      >
                        {{ expandedContent[item.stableId + '-reasoning'] ? 'Show less ▲' : 'Show more ▼' }}
                      </button>
                    </div>
                  </div>

                  <!-- Tool calls section (independent of message content, but don't need "No available message" if tools exist) -->
                  <div v-if="hasTools(item)" class="tool-list">
                    <div
                      v-for="(group, idx) in getToolGroups(item)"
                      :key="idx"
                      class="tool-item"
                    >
                      <div
                        class="tool-header-line"
                        @click="toggleTool(item.stableId + '-' + idx)"
                      >
                        <span class="tool-connector">{{ idx === getToolGroups(item).length - 1 ? '└─' : '├─' }}</span>
                        <span class="tool-expand-icon">{{ expandedTools[item.stableId + '-' + idx] ? '▼' : '▶' }}</span>
                        <span class="tool-name">🔧&nbsp;{{ group.start?.data?.toolName || group.tool || 'Tool' }}</span>
                        <span :class="getToolStatus(group).color" style="margin-left: 4px;">({{ getToolStatus(group).icon }}{{ getToolDuration(group) ? ' ' + getToolDuration(group) : '' }})</span>
                        <span v-if="getToolCommand(group)" style="color: #7d8590; margin-left: 8px;">{{ getToolCommand(group) }}</span>
                        <span v-if="getToolErrorMessage(group)" style="color: #ff7b72; margin-left: 8px;">{{ getToolErrorMessage(group).length > 80 ? getToolErrorMessage(group).substring(0, 80) + '...' : getToolErrorMessage(group) }}</span>
                      </div>

                      <div v-if="expandedTools[item.stableId + '-' + idx]" class="tool-detail">
                        <div v-if="group.timing.startTime || group.timing.endTime || group.timing.duration" class="tool-detail-section">
                          <div class="tool-detail-content tool-timing-line">
                            <span v-if="group.timing.startTime"><span class="tool-timing-label">Start</span> {{ formatToolTime(group.timing.startTime) }}</span>
                            <span v-if="group.timing.endTime"><span class="tool-timing-label">Complete</span> {{ formatToolTime(group.timing.endTime) }}</span>
                            <span v-if="group.timing.duration"><span class="tool-timing-label">Duration</span> {{ group.timing.duration }}</span>
                          </div>
                        </div>
                        <div v-if="group.start?.data?.arguments" class="tool-detail-section">
                          <div class="tool-detail-title">Arguments:</div>
                          <div class="tool-detail-content">
                            <pre>{{ JSON.stringify(group.start.data.arguments, null, 2) }}</pre>
                          </div>
                        </div>
                        <div v-if="group.complete?.data?.result" class="tool-detail-section">
                          <div class="tool-detail-title">Result:</div>
                          <div class="tool-detail-content">
                            <pre>{{ JSON.stringify(group.complete.data.result, null, 2) }}</pre>
                          </div>
                        </div>
                        <div v-if="getToolErrorMessage(group)" class="tool-detail-section">
                          <div class="tool-detail-title">Error:</div>
                          <div class="tool-detail-content" style="color: #ff7b72;">
                            {{ getToolErrorMessage(group) }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Separator (inside event for proper height calculation) -->
                  <div v-if="!item.isLastEvent" class="event-separator"></div>
                </div>
              </DynamicScrollerItem>
            </template>
          </DynamicScroller>

          <!-- Bottom spacer: ensures last item clears mobile browser nav bar -->
          <div class="scroller-bottom-spacer"></div>

          <!-- Floating scroll buttons -->
          <div class="scroll-float-btns">
            <button @click="scrollToTop" title="Scroll to top" class="scroll-edge-btn">▲</button>
            <button @click="scrollToBottom" title="Scroll to bottom" class="scroll-edge-btn">▼</button>
          </div>
        </div>
      </div>

    </div>
  `
});

  // Mount the app
  console.log('Mounting Vue app to #app...');
  console.log('App config:', app.config);
  console.log('Target element:', document.getElementById('app'));
  try {
    const vm = app.mount('#app');
    console.log('Vue app mounted successfully!', vm ? 'Instance created' : 'No instance');
    console.log('VM type:', typeof vm, 'Has exportSession:', typeof vm?.exportSession);
    console.log('VM keys:', vm ? Object.keys(vm).slice(0, 10) : 'NO_VM');
    console.log('#app innerHTML length:', document.getElementById('app').innerHTML.length);
    console.log('#app first 100 chars:', document.getElementById('app').innerHTML.substring(0, 100));
  } catch (error) {
    console.error('Mount failed:', error);
    console.error('Error stack:', error.stack);
  }
})(); // End IIFE
