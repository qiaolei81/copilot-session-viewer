import { computed } from 'vue';

export function useGapAnalysis(sortedEvents, totalDuration, totalToolTime) {
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
        const msgLength = (current.data?.message || '').length;
        description = `LLM reading user input (${msgLength} chars)`;
      } else if (current.type === 'assistant.turn_start' && next.type === 'assistant.message') {
        gapType = 'llm-generation';
        const outputLength = (next.data?.content || '').length;
        description = `LLM generating response (${outputLength} chars output)`;
      } else if (current.type === 'assistant.turn_start' && next.type === 'tool.execution_start') {
        gapType = 'llm-generation';
        const toolName = next.data?.toolName || 'unknown';
        description = `LLM deciding to call ${toolName}`;
      } else if (current.type === 'assistant.message' && next.type === 'assistant.turn_start') {
        gapType = 'turn-gap';
        description = 'Gap between assistant response and next turn';
      } else if (current.type === 'tool.execution_complete' && duration > 500) {
        gapType = 'post-tool';
        const toolName = current.data?.toolName || 'unknown';
        description = `Processing ${toolName} result`;
      } else if (duration > 5000) {
        gapType = 'idle';
        description = `${current.type} → ${next.type}`;
      }

      if (gapType) {
        gaps.push({
          type: gapType,
          description,
          startTime: current.timestamp,
          endTime: next.timestamp,
          duration,
          fromEvent: current.type,
          toEvent: next.type,
          fromData: current.data,
          toData: next.data
        });
      }
    }

    return gaps.sort((a, b) => (b.duration || 0) - (a.duration || 0));
  });

  const maxGapDuration = computed(() => {
    return Math.max(...gapAnalysis.value.map(g => g.duration || 0), 1);
  });

  const gapStats = computed(() => {
    const stats = {
      'input-consumption': { count: 0, total: 0, avg: 0 },
      'llm-generation': { count: 0, total: 0, avg: 0 },
      'post-tool': { count: 0, total: 0, avg: 0 },
      'turn-gap': { count: 0, total: 0, avg: 0 },
      'idle': { count: 0, total: 0, avg: 0 }
    };

    gapAnalysis.value.forEach(gap => {
      if (stats[gap.type]) {
        stats[gap.type].count++;
        stats[gap.type].total += gap.duration;
      }
    });

    Object.keys(stats).forEach(key => {
      if (stats[key].count > 0) {
        stats[key].avg = stats[key].total / stats[key].count;
      }
    });

    return stats;
  });

  const timeBreakdown = computed(() => {
    const sorted = sortedEvents.value;
    let userThinkingTime = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      if (next.type === 'user.message' && current.type !== 'user.message') {
        const gap = new Date(next.timestamp).getTime() - new Date(current.timestamp).getTime();
        if (gap > 1000) {
          userThinkingTime += gap;
        }
      }
    }

    const total = totalDuration.value || 0;
    const agentWorkingTime = Math.max(total - userThinkingTime, 0);
    const llmTime = Math.max(agentWorkingTime - totalToolTime.value, 0);

    return {
      userThinkingTime,
      agentWorkingTime,
      llmTime,
      userThinkingPct: total > 0 ? (userThinkingTime / total * 100).toFixed(0) : 0,
      agentWorkingPct: total > 0 ? (agentWorkingTime / total * 100).toFixed(0) : 0,
      llmPct: total > 0 ? (llmTime / total * 100).toFixed(0) : 0,
      toolPct: total > 0 ? (totalToolTime.value / total * 100).toFixed(0) : 0,
    };
  });

  return { gapAnalysis, maxGapDuration, gapStats, timeBreakdown };
}
