import { computed } from 'vue';

export function useUnifiedTimeline(groupedTurns, subagentAnalysis, sortedEvents, sessionStart, sessionEnd, buildAgentOpItem) {
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
        if (gapEnd - gapStart > 500) items.push(buildAgentOpItem(sorted, gapStart, gapEnd));
      }
      items.push({ ...sa, itemType: 'subagent' });
      const nextSa = agents[i + 1];
      const gapStart = new Date(sa.endTime).getTime();
      const gapEnd = nextSa ? new Date(nextSa.startTime).getTime() : sessionEnd.value;
      if (gapEnd - gapStart > 500) items.push(buildAgentOpItem(sorted, gapStart, gapEnd));
    }
    return items;
  });

  const unifiedTimelineItems = computed(() => {
    const items = [];
    const groups = groupedTurns.value;
    const agents = subagentAnalysis.value;
    const sorted = sortedEvents.value;

    if (groups.length) {
      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        const turns = group.turns;
        if (!turns.length) continue;

        const reqStart = new Date(turns[0].startTime).getTime();
        const reqEnd = new Date(turns[turns.length - 1].endTime).getTime();

        items.push({
          rowType: 'user-req', userReqNumber: group.userReqNumber,
          message: group.message, startTime: turns[0].startTime,
          endTime: turns[turns.length - 1].endTime, duration: reqEnd - reqStart,
        });

        const reqAgents = agents.filter(sa => {
          if (!sa.startTime) return false;
          const saStart = new Date(sa.startTime).getTime();
          return saStart >= reqStart && saStart <= reqEnd;
        });

        if (reqAgents.length) {
          for (let i = 0; i < reqAgents.length; i++) {
            const sa = reqAgents[i];
            const gapStart = i === 0 ? reqStart : new Date(reqAgents[i - 1].endTime).getTime();
            const gapEnd = new Date(sa.startTime).getTime();
            if (gapEnd - gapStart > 500) {
              const agentOp = buildAgentOpItem(sorted, gapStart, gapEnd);
              agentOp.rowType = 'main-agent';
              items.push(agentOp);
            }
            items.push({ ...sa, rowType: 'subagent', itemType: 'subagent' });
            if (i === reqAgents.length - 1) {
              const trailingStart = new Date(sa.endTime).getTime();
              if (reqEnd - trailingStart > 500) {
                const agentOp = buildAgentOpItem(sorted, trailingStart, reqEnd);
                agentOp.rowType = 'main-agent';
                items.push(agentOp);
              }
            }
          }
        } else {
          if (reqEnd - reqStart > 0) {
            const agentOp = buildAgentOpItem(sorted, reqStart, reqEnd);
            agentOp.rowType = 'main-agent';
            items.push(agentOp);
          }
        }
      }
    } else if (subagentTimelineItems.value.length) {
      for (const item of subagentTimelineItems.value) {
        items.push({ ...item, rowType: item.itemType === 'agent-op' ? 'main-agent' : 'subagent' });
      }
    }

    return items;
  });

  const ganttPosition = (startTs, endTs) => {
    if (!sessionStart.value || !totalDuration() || !startTs) return { left: '0%', width: '0%' };
    const s = new Date(startTs).getTime();
    const e = endTs ? new Date(endTs).getTime() : s + 1000;
    const td = totalDuration();
    const left = ((s - sessionStart.value) / td) * 100;
    const width = Math.max(((e - s) / td) * 100, 0.5);
    return { left: left + '%', width: Math.min(width, 100 - left) + '%' };
  };

  // Accept totalDuration as a function to avoid circular deps
  function totalDuration() {
    if (!sessionStart.value || !sessionEnd.value) return 0;
    return sessionEnd.value - sessionStart.value;
  }

  return { unifiedTimelineItems, subagentTimelineItems, ganttPosition };
}
