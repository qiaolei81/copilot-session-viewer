import { computed } from 'vue';
import { getDisplayInputTokens } from '../../utils/formatting.js';

export function getUsageCacheHitRatio(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const cacheReadTokens = Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
  const totalReadableInput = getDisplayInputTokens(usage) + cacheReadTokens;
  if (cacheReadTokens === 0 || totalReadableInput === 0) return null;
  return Math.round((cacheReadTokens / totalReadableInput) * 100);
}

export function useTokenUsage(metadata) {
  const totalTokens = computed(() => {
    if (!metadata.value.usage || !metadata.value.usage.modelMetrics) return 0;
    let total = 0;
    for (const model in metadata.value.usage.modelMetrics) {
      const usage = metadata.value.usage.modelMetrics[model].usage;
      if (usage) {
        total += (usage.inputTokens || 0) + (usage.outputTokens || 0);
      }
    }
    return total;
  });

  const totalRequests = computed(() => {
    if (!metadata.value.usage || !metadata.value.usage.modelMetrics) return 0;
    let total = 0;
    for (const model in metadata.value.usage.modelMetrics) {
      total += (metadata.value.usage.modelMetrics[model].requests?.count || 0);
    }
    return total;
  });

  const totalModels = computed(() => {
    if (!metadata.value.usage || !metadata.value.usage.modelMetrics) return 0;
    return Object.keys(metadata.value.usage.modelMetrics).length;
  });

  const getModelCacheHitRatio = (model) => {
    const metrics = metadata.value.usage?.modelMetrics[model];
    if (!metrics || !metrics.usage) return null;
    return getUsageCacheHitRatio(metrics.usage);
  };

  const getDisplayUsageInputTokens = (model) => {
    const metrics = metadata.value.usage?.modelMetrics[model];
    if (!metrics || !metrics.usage) return 0;
    return getDisplayInputTokens(metrics.usage);
  };

  return {
    totalTokens, totalRequests, totalModels,
    getModelCacheHitRatio, getDisplayUsageInputTokens,
  };
}
