import { ref, computed } from 'vue';
import { EVENT_MARKER_CATEGORIES, TRACKABLE_EVENT_TYPES } from './useTimelineCore.js';

export function useSubagentTimeline(sortedEvents, sessionStart, sessionEnd, totalDuration) {
  const showMarkerLegend = ref(false);

  const subagentToolMap = computed(() => {
    const sorted = sortedEvents.value;
    const subagentToolCallIds = new Set();
    for (const ev of sorted) {
      if (ev.type === 'subagent.started') {
        const tcid = ev.data?.toolCallId;
        if (tcid) subagentToolCallIds.add(tcid);
      }
    }
    const idMap = new Map();
    for (const ev of sorted) {
      if (ev.id) idMap.set(ev.id, ev);
    }
    const toolToSubagent = new Map();
    const startIdByToolCallId = new Map();
    for (const ev of sorted) {
      if (ev.type !== 'tool.execution_start') continue;
      let current = ev.parentId;
      let depth = 0;
      while (current && depth < 10) {
        const parent = idMap.get(current);
        if (!parent) break;
        if (parent.type === 'assistant.message') {
          const ptcid = parent.data?.parentToolCallId;
          if (ptcid && subagentToolCallIds.has(ptcid)) {
            toolToSubagent.set(ev.id, ptcid);
            const tcid = ev.data?.toolCallId;
            if (tcid) startIdByToolCallId.set(tcid, ptcid);
          }
          break;
        }
        current = parent.parentId;
        depth++;
      }
    }
    for (const ev of sorted) {
      if (ev.type !== 'tool.execution_complete') continue;
      const tcid = ev.data?.toolCallId;
      if (tcid && startIdByToolCallId.has(tcid)) {
        toolToSubagent.set(ev.id, startIdByToolCallId.get(tcid));
      }
    }
    return toolToSubagent;
  });

  const buildEventMarkers = (innerEvents, startTime, duration) => {
    if (!innerEvents.length || !duration) return [];

    const HIGH_PRIORITY_TYPES = new Set([
      'session.start', 'session.resume', 'session.error',
      'session.truncation', 'session.compaction_start', 'session.compaction_complete',
      'session.model_change', 'abort', 'user.message',
    ]);

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

    const toolErrorColor = (errorRatio) => {
      const r = Math.round(210 + (248 - 210) * errorRatio);
      const g = Math.round(153 + (81 - 153) * errorRatio);
      const b = Math.round(34 + (73 - 34) * errorRatio);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    };

    const isToolError = (ev) => {
      return ev.type === 'tool.execution_complete' && (ev.data?.isError || !!ev.data?.error);
    };

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
        const clusterColor = errorRatio > 0 ? toolErrorColor(errorRatio) : ((() => {
          const dominantType = group.reduce((best, ev) => {
            const cnt = group.filter(e => e.type === ev.type).length;
            return cnt > best.cnt ? { type: ev.type, cnt } : best;
          }, { type: group[0].type, cnt: 0 }).type;
          return (EVENT_MARKER_CATEGORIES[dominantType] || {}).color || '#8b949e';
        })());

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
  };

  const subagentAnalysis = computed(() => {
    const sorted = sortedEvents.value;
    const results = [];
    const startStack = [];

    for (const ev of sorted) {
      if (ev.type === 'subagent.started') {
        startStack.push(ev);
      } else if (ev.type === 'subagent.completed' || ev.type === 'subagent.failed') {
        const tcid = ev.data?.toolCallId;
        let startIdx = -1;
        if (tcid) {
          for (let i = startStack.length - 1; i >= 0; i--) {
            if (startStack[i].data?.toolCallId === tcid) {
              startIdx = i;
              break;
            }
          }
        }
        if (startIdx < 0 && startStack.length > 0) {
          startIdx = startStack.length - 1;
        }
        const startEv = startIdx >= 0 ? startStack.splice(startIdx, 1)[0] : null;
        const name = startEv?.data?.agentDisplayName || startEv?.data?.agentName || 'SubAgent';
        const startTime = startEv ? new Date(startEv.timestamp).getTime() : null;
        const endTime = new Date(ev.timestamp).getTime();
        const duration = startTime ? endTime - startTime : null;

        const subagentTcid = startEv?.data?.toolCallId;
        let toolCalls = 0;
        const innerEvents = [];
        if (startEv) {
          for (const e of sorted) {
            if (e.type === 'tool.execution_start') {
              if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) {
                toolCalls++;
              }
            }
            const t = new Date(e.timestamp).getTime();
            if (t >= startTime && t <= endTime) {
              if (TRACKABLE_EVENT_TYPES.has(e.type)) {
                if (e.type !== 'tool.execution_start' && e.type !== 'tool.execution_complete') {
                  innerEvents.push({ type: e.type, timestamp: t, data: e.data });
                } else if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) {
                  innerEvents.push({ type: e.type, timestamp: t, data: e.data });
                }
              }
            }
          }
        }

        const innerEventMarkers = buildEventMarkers(innerEvents, startTime, duration);

        results.push({
          name,
          status: ev.type === 'subagent.completed' ? 'completed' : 'failed',
          startTime: startEv?.timestamp || null,
          endTime: ev.timestamp,
          duration,
          toolCalls,
          innerEventMarkers
        });
      }
    }

    const sessionEndTime = sorted.length > 0 ? new Date(sorted[sorted.length - 1].timestamp).getTime() : Date.now();
    for (const startEv of startStack) {
      const name = startEv.data?.agentDisplayName || startEv.data?.agentName || 'SubAgent';
      const startTime = new Date(startEv.timestamp).getTime();
      const duration = sessionEndTime - startTime;

      const subagentTcid = startEv.data?.toolCallId;
      let toolCalls = 0;
      const innerEvents = [];
      for (const e of sorted) {
        if (e.type === 'tool.execution_start') {
          if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) {
            toolCalls++;
          }
        }
        const t = new Date(e.timestamp).getTime();
        if (t >= startTime && t <= sessionEndTime) {
          if (TRACKABLE_EVENT_TYPES.has(e.type)) {
            if (e.type !== 'tool.execution_start' && e.type !== 'tool.execution_complete') {
              innerEvents.push({ type: e.type, timestamp: t, data: e.data });
            } else if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) {
              innerEvents.push({ type: e.type, timestamp: t, data: e.data });
            }
          }
        }
      }

      const innerEventMarkers = buildEventMarkers(innerEvents, startTime, duration);

      results.push({
        name,
        status: 'incomplete',
        startTime: startEv.timestamp,
        endTime: sorted[sorted.length - 1]?.timestamp || startEv.timestamp,
        duration,
        toolCalls,
        innerEventMarkers
      });
    }

    return results.sort((a, b) => {
      const tA = a.startTime ? new Date(a.startTime).getTime() : 0;
      const tB = b.startTime ? new Date(b.startTime).getTime() : 0;
      return tA - tB;
    });
  });

  const maxSubagentDuration = computed(() => {
    return Math.max(...subagentAnalysis.value.map(s => s.duration || 0), 1);
  });

  const subagentStats = computed(() => {
    const agents = subagentAnalysis.value;
    const completed = agents.filter(a => a.status === 'completed').length;
    const failed = agents.filter(a => a.status === 'failed').length;
    const incomplete = agents.filter(a => a.status === 'incomplete').length;
    const successRate = agents.length ? ((completed / agents.length) * 100).toFixed(0) : 100;

    const intervals = agents
      .filter(a => a.startTime && a.endTime)
      .map(a => [new Date(a.startTime).getTime(), new Date(a.endTime).getTime()])
      .sort((a, b) => a[0] - b[0]);
    const mergedIntervals = [];
    for (const [s, e] of intervals) {
      if (!mergedIntervals.length || s >= mergedIntervals[mergedIntervals.length - 1].e) {
        mergedIntervals.push({ s, e });
      } else if (e > mergedIntervals[mergedIntervals.length - 1].e) {
        mergedIntervals[mergedIntervals.length - 1].e = e;
      }
    }
    const totalTime = mergedIntervals.reduce((sum, iv) => sum + (iv.e - iv.s), 0);
    const totalTools = agents.reduce((sum, a) => sum + (a.toolCalls || 0), 0);

    return { completed, failed, incomplete, totalTime, totalTools, successRate };
  });

  const buildAgentOpItem = (sorted, gapStart, gapEnd) => {
    const duration = gapEnd - gapStart;
    const gapEvents = [];
    const eventCounts = {};
    let toolCalls = 0;
    for (const e of sorted) {
      const t = new Date(e.timestamp).getTime();
      if (t >= gapStart && t <= gapEnd) {
        if (e.type.startsWith('tool.')) {
          const isSubagentTool = e.id && subagentToolMap.value.has(e.id);
          if (!isSubagentTool) {
            if (TRACKABLE_EVENT_TYPES.has(e.type)) {
              gapEvents.push({ type: e.type, timestamp: t, data: e.data });
            }
            if (e.type === 'tool.execution_start') {
              toolCalls++;
            }
            eventCounts.tool = (eventCounts.tool || 0) + 1;
          }
        } else {
          if (TRACKABLE_EVENT_TYPES.has(e.type)) {
            gapEvents.push({ type: e.type, timestamp: t, data: e.data });
          }
          let cat = 'other';
          if (e.type.startsWith('assistant.')) cat = 'message';
          else if (e.type.startsWith('user.')) cat = 'user';
          else if (e.type.startsWith('session.')) cat = 'session';
          eventCounts[cat] = (eventCounts[cat] || 0) + 1;
        }
      }
    }

    const parts = [];
    if (toolCalls) parts.push(toolCalls + ' tool' + (toolCalls > 1 ? 's' : ''));
    if (eventCounts.message) parts.push(eventCounts.message + ' message' + (eventCounts.message > 1 ? 's' : ''));
    if (eventCounts.user) parts.push(eventCounts.user + ' user msg');
    if (eventCounts.session) parts.push(eventCounts.session + ' session event' + (eventCounts.session > 1 ? 's' : ''));
    if (eventCounts.other) parts.push(eventCounts.other + ' other');
    const summary = parts.length ? parts.join(', ') : 'idle';

    const innerEventMarkers = buildEventMarkers(gapEvents, gapStart, duration);

    return {
      itemType: 'agent-op',
      name: 'Main Agent',
      summary,
      toolCalls,
      startTime: new Date(gapStart).toISOString(),
      endTime: new Date(gapEnd).toISOString(),
      duration,
      eventCounts,
      innerEventMarkers,
    };
  };

  const subagentTimelineItems = computed(() => {
    const agents = subagentAnalysis.value;
    if (!agents.length) return [];

    const sorted = sortedEvents.value;
    const items = [];

    for (let i = 0; i < agents.length; i++) {
      const sa = agents[i];

      if (i === 0 && sa.startTime) {
        const gapStart = sessionStart.value;
        const gapEnd = new Date(sa.startTime).getTime();
        if (gapEnd - gapStart > 500) {
          items.push(buildAgentOpItem(sorted, gapStart, gapEnd));
        }
      }

      items.push({ ...sa, itemType: 'subagent' });

      const nextSa = agents[i + 1];
      const gapStart = new Date(sa.endTime).getTime();
      const gapEnd = nextSa
        ? new Date(nextSa.startTime).getTime()
        : sessionEnd.value;

      if (gapEnd - gapStart > 500) {
        items.push(buildAgentOpItem(sorted, gapStart, gapEnd));
      }
    }

    return items;
  });

  return {
    subagentToolMap, buildEventMarkers, subagentAnalysis,
    maxSubagentDuration, subagentStats, buildAgentOpItem,
    subagentTimelineItems, showMarkerLegend,
  };
}
