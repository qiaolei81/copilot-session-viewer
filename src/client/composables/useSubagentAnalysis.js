import { computed } from 'vue';
import { buildEventMarkers, TRACKABLE_EVENT_TYPES } from './useEventMarkers.js';

export function useSubagentAnalysis(sortedEvents, _sessionStart, _sessionEnd) {
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
            if (startStack[i].data?.toolCallId === tcid) { startIdx = i; break; }
          }
        }
        if (startIdx < 0 && startStack.length > 0) startIdx = startStack.length - 1;
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
              if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) toolCalls++;
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

        results.push({
          name, status: ev.type === 'subagent.completed' ? 'completed' : 'failed',
          startTime: startEv?.timestamp || null, endTime: ev.timestamp,
          duration, toolCalls,
          innerEventMarkers: buildEventMarkers(innerEvents, startTime, duration)
        });
      }
    }

    // Incomplete subagents
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
          if (subagentTcid && subagentToolMap.value.get(e.id) === subagentTcid) toolCalls++;
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

      results.push({
        name, status: 'incomplete',
        startTime: startEv.timestamp, endTime: sorted[sorted.length - 1]?.timestamp || startEv.timestamp,
        duration, toolCalls,
        innerEventMarkers: buildEventMarkers(innerEvents, startTime, duration)
      });
    }

    return results.sort((a, b) => {
      const tA = a.startTime ? new Date(a.startTime).getTime() : 0;
      const tB = b.startTime ? new Date(b.startTime).getTime() : 0;
      return tA - tB;
    });
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

  return { subagentToolMap, subagentAnalysis, subagentStats };
}
