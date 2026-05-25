import { computed } from 'vue';
import { buildEventMarkers, TRACKABLE_EVENT_TYPES } from './useEventMarkers.js';

export function useGapAnalysis(sortedEvents, subagentToolMap, _sessionStart, _sessionEnd) {
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
            if (TRACKABLE_EVENT_TYPES.has(e.type)) gapEvents.push({ type: e.type, timestamp: t, data: e.data });
            if (e.type === 'tool.execution_start') toolCalls++;
            eventCounts.tool = (eventCounts.tool || 0) + 1;
          }
        } else {
          if (TRACKABLE_EVENT_TYPES.has(e.type)) gapEvents.push({ type: e.type, timestamp: t, data: e.data });
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

    return {
      itemType: 'agent-op',
      name: 'Main Agent',
      summary: parts.length ? parts.join(', ') : 'idle',
      toolCalls,
      startTime: new Date(gapStart).toISOString(),
      endTime: new Date(gapEnd).toISOString(),
      duration,
      eventCounts,
      innerEventMarkers: buildEventMarkers(gapEvents, gapStart, duration),
    };
  };

  const gapAnalysis = computed(() => {
    const sorted = sortedEvents.value;
    const gaps = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const currentTime = new Date(current.timestamp).getTime();
      const nextTime = new Date(next.timestamp).getTime();
      const duration = nextTime - currentTime;
      if (duration < 100) continue;

      let gapType = null;
      let description = '';

      if (current.type === 'user.message' && next.type === 'assistant.turn_start') {
        gapType = 'input-consumption';
        description = `LLM reading user input (${(current.data?.message || '').length} chars)`;
      } else if (current.type === 'assistant.turn_start' && next.type === 'assistant.message') {
        gapType = 'llm-generation';
        description = `LLM generating response (${(next.data?.content || '').length} chars output)`;
      } else if (current.type === 'assistant.turn_start' && next.type === 'tool.execution_start') {
        gapType = 'llm-generation';
        description = `LLM deciding to call ${next.data?.toolName || 'unknown'}`;
      } else if (current.type === 'assistant.message' && next.type === 'assistant.turn_start') {
        gapType = 'turn-gap';
        description = 'Gap between assistant response and next turn';
      } else if (current.type === 'tool.execution_complete' && duration > 500) {
        gapType = 'post-tool';
        description = `Processing ${current.data?.toolName || 'unknown'} result`;
      } else if (duration > 5000) {
        gapType = 'idle';
        description = `${current.type} → ${next.type}`;
      }

      if (gapType) {
        gaps.push({ type: gapType, description, startTime: current.timestamp, endTime: next.timestamp, duration, fromEvent: current.type, toEvent: next.type });
      }
    }
    return gaps.sort((a, b) => (b.duration || 0) - (a.duration || 0));
  });

  return { buildAgentOpItem, gapAnalysis };
}
