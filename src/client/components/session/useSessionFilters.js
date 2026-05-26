/**
 * Session filters composable — search, type filtering, event counts.
 */
import { ref, computed, watch } from 'vue';

export function useSessionFilters(flatEvents, subagentOwnership, selectedSubagent, filterBySubagent) {
  const currentFilter = ref('all');
  const searchText = ref('');
  const debouncedSearchText = ref('');
  const typeFilterOpen = ref(false);

  let searchTimeout = null;

  watch(searchText, (newValue) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      debouncedSearchText.value = newValue;
    }, 300);
  });

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

  const setFilter = (type) => { currentFilter.value = type; };

  const closeTypeFilter = (e) => {
    const dropdown = document.querySelector('.filter-type-wrapper');
    if (dropdown && !dropdown.contains(e.target)) typeFilterOpen.value = false;
  };

  const getSearchTimeout = () => searchTimeout;
  const clearSearchTimeout = () => { if (searchTimeout) { clearTimeout(searchTimeout); searchTimeout = null; } };

  return {
    currentFilter,
    searchText,
    debouncedSearchText,
    typeFilterOpen,
    activeFilterCount,
    clearAllFilters,
    filteredEvents,
    eventCounts,
    searchResultCount,
    filters,
    setFilter,
    closeTypeFilter,
    getSearchTimeout,
    clearSearchTimeout
  };
}
