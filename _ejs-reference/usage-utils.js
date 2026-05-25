/**
 * Token usage helpers shared by the session detail sidebar and unit tests.
 */

/**
 * Calculate uncached input tokens for display.
 *
 * The backend aggregates Claude input tokens as the sum of uncached input,
 * cache reads, and cache writes. The sidebar shows cache activity on separate
 * lines, so the displayed input value should exclude the cached portions.
 *
 * @param {Object} usage - Usage payload for a model
 * @returns {number} Uncached input token count
 */
function getDisplayInputTokens(usage) {
  if (!usage || typeof usage !== 'object') {
    return 0;
  }

  const inputTokens = Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0;
  const cacheReadTokens = Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
  const cacheWriteTokens = Number.isFinite(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0;

  return Math.max(inputTokens - cacheReadTokens - cacheWriteTokens, 0);
}

/**
 * Calculate cache hit ratio using only read input tokens.
 *
 * @param {Object} usage - Usage payload for a model
 * @returns {number|null} Rounded cache hit ratio percentage
 */
function getCacheHitRatio(usage) {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const cacheReadTokens = Number.isFinite(usage.cacheReadTokens) ? usage.cacheReadTokens : 0;
  const totalReadableInput = getDisplayInputTokens(usage) + cacheReadTokens;

  if (cacheReadTokens === 0 || totalReadableInput === 0) {
    return null;
  }

  return Math.round((cacheReadTokens / totalReadableInput) * 100);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getDisplayInputTokens, getCacheHitRatio };
}
