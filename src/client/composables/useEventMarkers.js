

export const EVENT_MARKER_CATEGORIES = {
  'tool.execution_start':        { color: '#d29922', shape: 'diamond', label: 'Tool Start' },
  'tool.execution_complete':     { color: '#e3b341', shape: 'diamond', label: 'Tool Complete' },
  'assistant.message':           { color: '#8b949e', shape: 'circle',  label: 'Message' },
  'user.message':                { color: '#79c0ff', shape: 'square',  label: 'User Message' },
  'session.start':               { color: '#56d364', shape: 'square',  label: 'Session Start' },
  'session.resume':              { color: '#56d364', shape: 'square',  label: 'Session Resume' },
  'session.error':               { color: '#f85149', shape: 'triangle', label: 'Error' },
  'session.truncation':          { color: '#f0883e', shape: 'triangle', label: 'Truncation' },
  'session.compaction_start':    { color: '#a371f7', shape: 'square',  label: 'Compaction Start' },
  'session.compaction_complete': { color: '#bc8cff', shape: 'square',  label: 'Compaction End' },
  'session.model_change':        { color: '#f778ba', shape: 'square',  label: 'Model Change' },
  'abort':                       { color: '#ff7b72', shape: 'triangle', label: 'Abort' },
};

export const TRACKABLE_EVENT_TYPES = new Set(Object.keys(EVENT_MARKER_CATEGORIES));

const HIGH_PRIORITY_TYPES = new Set([
  'session.start', 'session.resume', 'session.error',
  'session.truncation', 'session.compaction_start', 'session.compaction_complete',
  'session.model_change', 'abort', 'user.message',
]);

function isToolError(ev) {
  return ev.type === 'tool.execution_complete' && (ev.data?.isError || !!ev.data?.error);
}

function toolErrorColor(errorRatio) {
  const r = Math.round(210 + (248 - 210) * errorRatio);
  const g = Math.round(153 + (81 - 153) * errorRatio);
  const b = Math.round(34 + (73 - 34) * errorRatio);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

export function buildEventMarkers(innerEvents, startTime, duration) {
  if (!innerEvents.length || !duration) return [];

  const hiPriEvents = [];
  const toolEvents = [];
  for (const ev of innerEvents) {
    if (HIGH_PRIORITY_TYPES.has(ev.type)) {
      hiPriEvents.push(ev);
    } else {
      toolEvents.push(ev);
    }
  }

  const hiPriMarkers = hiPriEvents.map(ev => {
    const relPos = ((ev.timestamp - startTime) / duration) * 100;
    const cat = EVENT_MARKER_CATEGORIES[ev.type] || {};
    return {
      type: ev.type,
      position: Math.max(0, Math.min(100, relPos)),
      color: cat.color || '#8b949e',
      shape: cat.shape || 'circle',
      label: cat.label || ev.type,
      timestamp: ev.timestamp,
      toolName: ev.data?.toolName || null,
    };
  });

  const MIN_BUCKET_MS = 5 * 60 * 1000;
  const bucketSize = Math.max(MIN_BUCKET_MS, duration / 20);

  const buckets = new Map();
  for (const ev of toolEvents) {
    const bucketIdx = Math.floor((ev.timestamp - startTime) / bucketSize);
    if (!buckets.has(bucketIdx)) buckets.set(bucketIdx, []);
    buckets.get(bucketIdx).push(ev);
  }

  const toolMarkers = [];
  for (const [bucketIdx, group] of buckets) {
    const bucketMid = startTime + (bucketIdx + 0.5) * bucketSize;
    const relPos = ((bucketMid - startTime) / duration) * 100;
    const pos = Math.max(0, Math.min(100, relPos));

    const errorCount = group.filter(isToolError).length;
    const completeCount = group.filter(ev => ev.type === 'tool.execution_complete').length;
    const errorRatio = completeCount > 0 ? errorCount / completeCount : 0;

    if (group.length === 1) {
      const ev = group[0];
      const cat = EVENT_MARKER_CATEGORIES[ev.type] || {};
      const color = isToolError(ev) ? '#f85149' : cat.color || '#8b949e';
      toolMarkers.push({
        type: ev.type,
        position: pos,
        color,
        shape: cat.shape || 'circle',
        label: isToolError(ev) ? (cat.label || ev.type) + ' (error)' : (cat.label || ev.type),
        timestamp: ev.timestamp,
        toolName: ev.data?.toolName || null,
      });
    } else {
      const typeCounts = {};
      group.forEach(ev => {
        const cat = EVENT_MARKER_CATEGORIES[ev.type] || {};
        const lbl = cat.label || ev.type;
        typeCounts[lbl] = (typeCounts[lbl] || 0) + 1;
      });
      if (errorCount > 0) typeCounts['Errors'] = errorCount;
      const summaryParts = Object.entries(typeCounts).map(([l, c]) => c + ' ' + l);
      const clusterColor = errorRatio > 0 ? toolErrorColor(errorRatio) : (() => {
        const dominantType = group.reduce((best, ev) => {
          const cnt = group.filter(e => e.type === ev.type).length;
          return cnt > best.cnt ? { type: ev.type, cnt } : best;
        }, { type: group[0].type, cnt: 0 }).type;
        return (EVENT_MARKER_CATEGORIES[dominantType] || {}).color || '#8b949e';
      })();

      toolMarkers.push({
        type: 'cluster',
        position: pos,
        color: clusterColor,
        shape: 'cluster',
        label: summaryParts.join(', '),
        count: group.length,
        items: group,
      });
    }
  }

  return [...hiPriMarkers, ...toolMarkers].sort((a, b) => a.position - b.position);
}

export function useEventMarkers() {
  return { EVENT_MARKER_CATEGORIES, TRACKABLE_EVENT_TYPES, buildEventMarkers };
}
