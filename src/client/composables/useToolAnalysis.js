import { computed, ref } from 'vue';

export function useToolAnalysis(sortedEvents) {
  const sortField = ref('timestamp');
  const sortDir = ref('asc');

  const toolAnalysis = computed(() => {
    const sorted = sortedEvents.value;
    const toolGroups = new Map();

    for (const ev of sorted) {
      if (ev.type === 'tool.execution_start') {
        const toolId = ev.data?.toolCallId;
        if (toolId) toolGroups.set(toolId, { start: ev });
      } else if (ev.type === 'tool.execution_complete') {
        const toolId = ev.data?.toolCallId;
        if (toolId && toolGroups.has(toolId)) toolGroups.get(toolId).complete = ev;
      }
    }

    const results = [];
    toolGroups.forEach((group, toolId) => {
      const startTime = new Date(group.start.timestamp).getTime();
      const endTime = group.complete ? new Date(group.complete.timestamp).getTime() : null;
      const duration = endTime ? endTime - startTime : null;
      const toolName = group.start.data?.toolName || group.start.data?.tool || 'unknown';
      const args = group.start.data?.arguments || {};
      const isError = group.complete?.data?.isError || !!group.complete?.data?.error;

      let description;
      if (['Bash', 'bash', 'exec'].includes(toolName)) {
        description = args.command || args.description || '';
      } else if (['Read', 'read', 'Write', 'write', 'Edit', 'edit'].includes(toolName)) {
        description = args.file_path || args.path || '';
      } else if (['Glob', 'glob'].includes(toolName)) {
        description = args.pattern || '';
      } else if (['Grep', 'grep'].includes(toolName)) {
        description = args.pattern || '';
      } else if (['Task', 'task'].includes(toolName)) {
        description = args.description || args.prompt?.substring(0, 80) || '';
      } else {
        description = args.description || args.command || args.file_path || args.path || args.query || args.url || '';
      }
      if (description.length > 120) description = description.substring(0, 120) + '...';

      results.push({
        toolId, toolName, description,
        startTime: group.start.timestamp,
        endTime: group.complete?.timestamp || null,
        duration, isError, isRunning: !group.complete,
      });
    });

    return results;
  });

  const sortedToolAnalysis = computed(() => {
    const items = [...toolAnalysis.value];
    items.sort((a, b) => {
      if (sortField.value === 'duration') {
        return sortDir.value === 'asc' ? (a.duration || 0) - (b.duration || 0) : (b.duration || 0) - (a.duration || 0);
      }
      if (sortField.value === 'toolName') {
        const cmp = (a.toolName || '').localeCompare(b.toolName || '');
        return sortDir.value === 'asc' ? cmp : -cmp;
      }
      const tA = new Date(a.startTime).getTime();
      const tB = new Date(b.startTime).getTime();
      return sortDir.value === 'asc' ? tA - tB : tB - tA;
    });
    return items;
  });

  const totalToolCount = computed(() => toolAnalysis.value.length);
  const successRate = computed(() => {
    const total = toolAnalysis.value.length;
    if (total === 0) return 100;
    const errors = toolAnalysis.value.filter(t => t.isError).length;
    return ((total - errors) / total * 100).toFixed(1);
  });
  const errorCount = computed(() => toolAnalysis.value.filter(t => t.isError).length);

  const totalToolTime = computed(() => {
    const intervals = toolAnalysis.value
      .filter(t => t.duration && t.startTime && t.endTime)
      .map(t => ({ start: new Date(t.startTime).getTime(), end: new Date(t.endTime).getTime() }))
      .sort((a, b) => a.start - b.start);
    if (!intervals.length) return 0;
    let totalMs = 0;
    let curStart = intervals[0].start;
    let curEnd = intervals[0].end;
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].start <= curEnd) {
        curEnd = Math.max(curEnd, intervals[i].end);
      } else {
        totalMs += curEnd - curStart;
        curStart = intervals[i].start;
        curEnd = intervals[i].end;
      }
    }
    totalMs += curEnd - curStart;
    return totalMs;
  });

  const avgToolDuration = computed(() => {
    if (!totalToolCount.value) return 0;
    const rawSum = toolAnalysis.value.reduce((acc, t) => acc + (t.duration || 0), 0);
    return rawSum / totalToolCount.value;
  });

  const toolTimeByCategory = computed(() => {
    const catMap = {};
    toolAnalysis.value.forEach(t => {
      const name = (t.toolName || 'unknown').toLowerCase();
      let cat;
      if (['bash', 'exec'].includes(name)) cat = 'Bash/Exec';
      else if (name === 'read') cat = 'Read';
      else if (name === 'write') cat = 'Write';
      else if (name === 'edit') cat = 'Edit';
      else if (name === 'glob') cat = 'Glob';
      else if (name === 'grep') cat = 'Grep';
      else if (name === 'task') cat = 'Task (SubAgent)';
      else if (['web_search', 'websearch'].includes(name)) cat = 'Web Search';
      else if (['web_fetch', 'webfetch'].includes(name)) cat = 'Web Fetch';
      else cat = t.toolName || 'Other';

      if (!catMap[cat]) catMap[cat] = { category: cat, totalTime: 0, count: 0, errors: 0 };
      catMap[cat].totalTime += (t.duration || 0);
      catMap[cat].count++;
      if (t.isError) catMap[cat].errors++;
    });
    return Object.values(catMap).sort((a, b) => b.count - a.count);
  });

  const maxCategoryTime = computed(() => Math.max(...toolTimeByCategory.value.map(c => c.totalTime), 1));

  const toggleSort = (field) => {
    if (sortField.value === field) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortField.value = field;
      sortDir.value = field === 'duration' ? 'desc' : 'asc';
    }
  };

  return {
    toolAnalysis, sortedToolAnalysis, totalToolCount, successRate, errorCount,
    totalToolTime, avgToolDuration, toolTimeByCategory, maxCategoryTime,
    sortField, sortDir, toggleSort,
  };
}
