import { computed } from 'vue';

export function useTimeBreakdown(sortedEvents, totalDuration, totalToolTime) {
  const timeBreakdown = computed(() => {
    const sorted = sortedEvents.value;
    let userThinkingTime = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      if (next.type === 'user.message' && current.type !== 'user.message') {
        const gap = new Date(next.timestamp).getTime() - new Date(current.timestamp).getTime();
        if (gap > 1000) userThinkingTime += gap;
      }
    }

    const total = totalDuration.value || 0;
    const agentWorkingTime = Math.max(total - userThinkingTime, 0);
    const llmTime = Math.max(agentWorkingTime - totalToolTime.value, 0);

    return {
      userThinkingTime, agentWorkingTime, llmTime,
      userThinkingPct: total > 0 ? (userThinkingTime / total * 100).toFixed(0) : 0,
      agentWorkingPct: total > 0 ? (agentWorkingTime / total * 100).toFixed(0) : 0,
      llmPct: total > 0 ? (llmTime / total * 100).toFixed(0) : 0,
      toolPct: total > 0 ? (totalToolTime.value / total * 100).toFixed(0) : 0,
    };
  });

  return { timeBreakdown };
}
