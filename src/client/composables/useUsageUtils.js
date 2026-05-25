/**
 * Usage utility functions adapted from src/frontend/usage-utils.js.
 */

export function getDisplayInputTokens(usage) {
  if (!usage || typeof usage !== 'object') return 0;

  const inputTokens = Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0;
  const cacheReadTokens = Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
  const cacheWriteTokens = Number.isFinite(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0;

  return Math.max(inputTokens - cacheReadTokens - cacheWriteTokens, 0);
}

export function getCacheHitRatio(usage) {
  if (!usage || typeof usage !== 'object') return null;

  const cacheReadTokens = Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
  const totalReadableInput = getDisplayInputTokens(usage) + cacheReadTokens;

  if (cacheReadTokens === 0 || totalReadableInput === 0) return null;

  return Math.round((cacheReadTokens / totalReadableInput) * 100);
}

export function useUsageUtils() {
  return { getDisplayInputTokens, getCacheHitRatio };
}
