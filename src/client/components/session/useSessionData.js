/**
 * Session detail composable — orchestrates focused composables.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { marked } from 'marked';
import { getDisplayInputTokens } from '../../utils/formatting.js';
import { useSubagentAnalysis } from './useSubagentAnalysis.js';
import { useSessionFilters } from './useSessionFilters.js';
import { useSessionFormatting } from './useSessionFormatting.js';
import { useToolHelpers } from './useToolHelpers.js';
import { useSessionTags } from './useSessionTags.js';
import { useSessionExport } from './useSessionExport.js';

// ── Usage utils ──

function getUsageCacheHitRatio(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const cacheReadTokens = Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
  const totalReadableInput = getDisplayInputTokens(usage) + cacheReadTokens;
  if (cacheReadTokens === 0 || totalReadableInput === 0) return null;
  return Math.round((cacheReadTokens / totalReadableInput) * 100);
}

// ── Composable ──

export function useSessionData() {
  const route = useRoute();
  const sessionId = computed(() => route.params.id);
  const source = computed(() => route.params.source);
  const customDirId = computed(() => route.query.dirId || null);
  const metadata = ref({});

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

  const currentTurnIndex = ref(0);
  const scrollerRef = ref(null);
  const visibleRange = ref({ start: 0, end: 0 });

  let scrollCleanup = null;

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

  // ── Compose sub-composables ──

  const subagent = useSubagentAnalysis(flatEvents);

  // Watch for dropdown focus
  watch(subagent.subagentDropdownOpen, (open) => {
    if (open) nextTick(() => subagent.subagentSearchRef.value?.focus());
  });

  // Wrap selectSubagent to also reset filter
  const selectSubagent = (toolCallId) => {
    subagent.selectSubagent(toolCallId);
    if (toolCallId) sessionFilters.currentFilter.value = 'all';
  };

  const sessionFilters = useSessionFilters(
    flatEvents,
    subagent.subagentOwnership,
    subagent.selectedSubagent,
    subagent.filterBySubagent
  );

  // Cleanup expansion state on filter changes
  watch(sessionFilters.currentFilter, () => cleanupExpansionState());
  watch(sessionFilters.debouncedSearchText, () => cleanupExpansionState());

  const formatting = useSessionFormatting();
  const toolHelpers = useToolHelpers();
  const tags = useSessionTags(sessionId, source);
  const sessionExport = useSessionExport(sessionId, source);

  // ── Expansion helpers ──

  const expansionCount = computed(() => {
    return Object.keys(expandedTools.value).filter(k => expandedTools.value[k]).length +
      Object.keys(expandedContent.value).filter(k => expandedContent.value[k]).length;
  });

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

  // ── Turns & user reqs ──

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

  // ── Badge helpers ──

  const getBadgeInfo = (type, item) => {
    if (item?.data?.badgeLabel && item?.data?.badgeClass) {
      return { label: item.data.badgeLabel, style: badgeClassToStyle(item.data.badgeClass) };
    }
    if (type === 'message' && item?.data?.role === 'toolResult') {
      return { label: 'TOOL RESULT', style: { backgroundColor: 'var(--color-badge-tool)', color: '#fff' } };
    }
    if (type === 'session.model_change') return { label: 'MODEL CHANGE', style: { backgroundColor: 'var(--color-badge-session)', color: '#fff' } };
    if (type === 'session.truncation') return { label: 'TRUNCATION', style: { backgroundColor: 'var(--color-badge-truncation)', color: '#fff' } };
    if (type === 'session.compaction_start' || type === 'session.compaction_complete') return { label: 'COMPACTION', style: { backgroundColor: 'var(--color-badge-compaction)', color: '#fff' } };
    if (type === 'system.notification') return { label: 'SYSTEM', style: { backgroundColor: 'var(--color-badge-system)', color: '#adbac7', fontStyle: 'italic' } };
    const parts = (type || '').split('.');
    const category = parts[0] || 'unknown';
    const badges = {
      user: { label: 'USER', style: { backgroundColor: 'var(--color-badge-user)', color: '#fff' } },
      assistant: { label: 'ASSISTANT', style: { backgroundColor: 'var(--color-badge-assistant)', color: '#fff' } },
      reasoning: { label: 'REASONING', style: { backgroundColor: 'var(--color-badge-reasoning)', color: '#fff' } },
      turn: { label: 'TURN', style: { backgroundColor: 'var(--color-badge-turn)', color: '#fff' } },
      tool: { label: 'TOOL', style: { backgroundColor: 'var(--color-badge-tool)', color: '#fff' } },
      subagent: { label: 'SUBAGENT', style: { backgroundColor: 'var(--color-badge-subagent)', color: '#fff' } },
      skill: { label: 'SKILL', style: { backgroundColor: 'var(--color-badge-skill)', color: '#fff' } },
      session: { label: 'SESSION', style: { backgroundColor: 'var(--color-badge-session)', color: '#fff' } },
      error: { label: 'ERROR', style: { backgroundColor: 'var(--color-badge-error)', color: '#fff' } },
      abort: { label: 'ABORT', style: { backgroundColor: 'var(--color-badge-abort)', color: '#fff' } },
      system: { label: 'SYSTEM', style: { backgroundColor: 'var(--color-badge-system)', color: '#adbac7', fontStyle: 'italic' } }
    };
    return badges[category] || { label: category.toUpperCase(), style: { backgroundColor: 'var(--color-badge-default)', color: '#fff' } };
  };

  function badgeClassToStyle(cls) {
    const style = { color: '#fff' };
    const tokenMap = {
      'badge-user': 'var(--color-badge-user)',
      'badge-assistant': 'var(--color-badge-assistant)',
      'badge-reasoning': 'var(--color-badge-reasoning)',
      'badge-turn': 'var(--color-badge-turn)',
      'badge-tool': 'var(--color-badge-tool)',
      'badge-subagent': 'var(--color-badge-subagent)',
      'badge-skill': 'var(--color-badge-skill)',
      'badge-session': 'var(--color-badge-session)',
      'badge-error': 'var(--color-badge-error)',
      'badge-abort': 'var(--color-badge-abort)',
      'badge-truncation': 'var(--color-badge-truncation)',
      'badge-compaction': 'var(--color-badge-compaction)',
      'badge-system': 'var(--color-badge-system)',
      'badge-hook': 'var(--color-badge-tool)',
      'badge-default': 'var(--color-badge-default)',
    };
    const trimmed = cls.trim();
    if (tokenMap[trimmed]) {
      style.backgroundColor = tokenMap[trimmed];
    } else {
      const bgMatch = cls.match(/bg-\[([^\]]+)\]/);
      if (bgMatch) {
        style.backgroundColor = bgMatch[1];
      } else if (cls.includes('bg-accent-emphasis')) {
        style.backgroundColor = 'var(--color-badge-user)';
      } else if (cls.includes('bg-success-emphasis')) {
        style.backgroundColor = 'var(--color-badge-assistant)';
      } else if (cls.includes('bg-purple-light')) {
        style.backgroundColor = 'var(--color-badge-reasoning)';
      } else if (cls.includes('bg-text-faint')) {
        style.backgroundColor = 'var(--color-badge-session)';
      } else if (cls.includes('bg-danger')) {
        style.backgroundColor = 'var(--color-badge-error)';
      } else if (cls.includes('bg-surface-overlay')) {
        style.backgroundColor = 'var(--color-badge-system)';
      } else if (cls.includes('bg-pink')) {
        style.backgroundColor = 'var(--color-badge-skill)';
      } else if (cls.includes('bg-accent')) {
        style.backgroundColor = 'var(--color-badge-default)';
      }
    }
    if (cls.includes('italic')) style.fontStyle = 'italic';
    if (trimmed === 'badge-system') style.color = '#adbac7';
    return style;
  }

  // ── Scroll & navigation ──

  const _retryTimerIds = [];

  const scrollToTurn = (turn) => {
    sessionFilters.searchText.value = '';
    sessionFilters.currentFilter.value = 'all';
    subagent.selectedSubagent.value = null;
    currentTurnIndex.value = turn.id;
    nextTick(() => {
      if (scrollerRef.value) {
        const targetIndex = sessionFilters.filteredEvents.value.findIndex(e => e.virtualIndex === turn.index);
        if (targetIndex >= 0) {
          const doScroll = (attempts) => {
            if (attempts <= 0 || !scrollerRef.value) return;
            scrollerRef.value.scrollToItem(targetIndex);
            _retryTimerIds.push(setTimeout(() => doScroll(attempts - 1), 100));
          };
          _retryTimerIds.push(setTimeout(() => doScroll(3), 50));
        }
      }
    });
  };

  const scrollToTop = () => {
    if (!scrollerRef.value) return;
    const doScroll = (a) => { if (a <= 0 || !scrollerRef.value) return; scrollerRef.value.scrollToItem(0); _retryTimerIds.push(setTimeout(() => doScroll(a - 1), 100)); };
    doScroll(3);
  };

  const scrollToBottom = () => {
    if (!scrollerRef.value) return;
    const lastIndex = sessionFilters.filteredEvents.value.length - 1;
    const doScroll = (a) => { if (a <= 0 || !scrollerRef.value) return; scrollerRef.value.scrollToItem(lastIndex); _retryTimerIds.push(setTimeout(() => doScroll(a - 1), 100)); };
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

  // ── Close dropdowns on outside click ──

  const handleKeydown = (e) => {
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      sidebarCollapsed.value = !sidebarCollapsed.value;
    }
  };

  // ── Lifecycle ──

  onMounted(async () => {
    document.addEventListener('click', sessionFilters.closeTypeFilter);
    document.addEventListener('click', subagent.closeSubagentDropdown);
    window.addEventListener('keydown', handleKeydown);

    marked.setOptions({ breaks: true, gfm: true });

    // Load metadata (from store cache or API)
    const sessionStore = (await import('../../stores/sessionStore.js')).useSessionStore();
    try {
      const metaData = await sessionStore.fetchMetadata(sessionId.value, source.value, customDirId.value);
      if (metaData) {
        metadata.value = metaData;
      }
    } catch (err) {
      console.error('Error loading metadata:', err);
    }

    // Load events (from store cache or API)
    try {
      loadedEvents.value = await sessionStore.fetchEvents(sessionId.value, source.value, customDirId.value);

      // Update 'Updated' time from last event timestamp
      if (loadedEvents.value.length > 0) {
        const lastEvent = loadedEvents.value[loadedEvents.value.length - 1];
        const lastTime = lastEvent.timestamp || lastEvent.time || lastEvent.data?.timestamp;
        if (lastTime) metadata.value = { ...metadata.value, updated: new Date(lastTime) };
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
            const targetIndex = sessionFilters.filteredEvents.value.findIndex(e => e.virtualIndex === targetEvent.virtualIndex);
            if (targetIndex >= 0 && scrollerRef.value) {
              const doScroll = (attempts) => {
                if (attempts <= 0 || !scrollerRef.value) return;
                scrollerRef.value.scrollToItem(targetIndex);
                _retryTimerIds.push(setTimeout(() => doScroll(attempts - 1), 100));
              };
              _retryTimerIds.push(setTimeout(() => doScroll(3), 50));
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
    await tags.loadTags();
    await tags.loadAllTags();

    // Scroll listener for visible range
    _retryTimerIds.push(setTimeout(() => {
      const scroller = document.querySelector('.vue-recycle-scroller');
      if (scroller) {
        const updateVisibleRange = () => {
          const scrollTop = scroller.scrollTop;
          const clientHeight = scroller.clientHeight;
          const avgItemHeight = 80;
          const startIndex = Math.floor(scrollTop / avgItemHeight);
          const visibleCount = Math.ceil(clientHeight / avgItemHeight);
          const endIndex = Math.min(startIndex + visibleCount, sessionFilters.filteredEvents.value.length);
          const startPos = Math.max(1, startIndex + 1);
          const endPos = Math.max(1, endIndex);
          visibleRange.value = { start: Math.min(startPos, endPos), end: endPos };
        };
        scroller.addEventListener('scroll', updateVisibleRange);
        scrollCleanup = () => scroller.removeEventListener('scroll', updateVisibleRange);
        updateVisibleRange();
      }
    }, 500));
  });

  onBeforeUnmount(() => {
    _retryTimerIds.forEach(id => clearTimeout(id));
    _retryTimerIds.length = 0;
    document.removeEventListener('click', sessionFilters.closeTypeFilter);
    document.removeEventListener('click', subagent.closeSubagentDropdown);
    window.removeEventListener('keydown', handleKeydown);
    sessionFilters.clearSearchTimeout();
    if (scrollCleanup) { scrollCleanup(); scrollCleanup = null; }
    tags.cleanup();
    expandedTools.value = {};
    expandedContent.value = {};
    formatting.clearMarkdownCache();
  });

  return {
    sessionId, source, metadata, exporting: sessionExport.exporting, sidebarCollapsed,
    expandedTools, expandedContent, expansionCount,
    currentFilter: sessionFilters.currentFilter, searchText: sessionFilters.searchText,
    debouncedSearchText: sessionFilters.debouncedSearchText, currentTurnIndex,
    scrollerRef, visibleRange,
    loadedEvents, eventsLoading, eventsError,
    flatEvents, filteredEvents: sessionFilters.filteredEvents,
    eventCounts: sessionFilters.eventCounts, filters: sessionFilters.filters,
    turns, userReqs, truncateText: formatting.truncateText,
    formatTime: formatting.formatTime, formatToolTime: formatting.formatToolTime,
    formatDateTime: formatting.formatDateTime,
    renderMarkdown: formatting.renderMarkdown, highlightSearchText: formatting.highlightSearchText,
    toggleTool, toggleContent, isContentTooLong: formatting.isContentTooLong,
    truncateContent: formatting.truncateContent,
    getBadgeInfo,
    getToolStatus: toolHelpers.getToolStatus, getToolErrorMessage: toolHelpers.getToolErrorMessage,
    getToolDuration: toolHelpers.getToolDuration, getToolCommand: toolHelpers.getToolCommand,
    hasTools: toolHelpers.hasTools, getToolGroups: toolHelpers.getToolGroups,
    getSubagentInfo: subagent.getSubagentInfo, getSubagentColor: subagent.getSubagentColor,
    subagentOwnership: subagent.subagentOwnership,
    setFilter: sessionFilters.setFilter, selectSubagent, selectedSubagent: subagent.selectedSubagent,
    subagentList: subagent.subagentList, filteredSubagentList: subagent.filteredSubagentList,
    subagentDropdownOpen: subagent.subagentDropdownOpen, subagentSearchQuery: subagent.subagentSearchQuery,
    subagentSearchRef: subagent.subagentSearchRef,
    subagentTokenUsage: subagent.subagentTokenUsage, SUBAGENT_COLORS: subagent.SUBAGENT_COLORS,
    typeFilterOpen: sessionFilters.typeFilterOpen, activeFilterCount: sessionFilters.activeFilterCount,
    clearAllFilters: sessionFilters.clearAllFilters,
    scrollToTurn, scrollToTop, scrollToBottom, jumpToTurn,
    getTurnNumber, getTurnDuration, repoBasename, escapeHtml: formatting.escapeHtml,
    exportSession: sessionExport.exportSession, searchResultCount: sessionFilters.searchResultCount,
    // Tags
    sessionTags: tags.sessionTags, allTags: tags.allTags, tagsEditing: tags.tagsEditing,
    editingTags: tags.editingTags, tagInputValue: tags.tagInputValue, tagInputRef: tags.tagInputRef,
    tagsError: tags.tagsError, showAutocomplete: tags.showAutocomplete,
    autocompleteOptions: tags.autocompleteOptions, autocompleteSelectedIndex: tags.autocompleteSelectedIndex,
    getTagColor: tags.getTagColor, startEditTags: tags.startEditTags, cancelEditTags: tags.cancelEditTags,
    addTag: tags.addTag, removeTagFromEdit: tags.removeTagFromEdit,
    updateAutocomplete: tags.updateAutocomplete, selectAutocompleteOption: tags.selectAutocompleteOption,
    saveTagsOnBlur: tags.saveTagsOnBlur,
    // Usage
    formatTokens: formatting.formatTokens, formatDuration: formatting.formatDuration,
    formatCost: formatting.formatCost,
    totalTokens, totalRequests, totalModels,
    getDisplayUsageInputTokens, getModelCacheHitRatio, toolCallingSummary
  };
}
