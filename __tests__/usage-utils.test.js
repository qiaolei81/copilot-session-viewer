/**
 * Unit tests for token usage helpers shared with the session detail sidebar.
 */

const { getDisplayInputTokens, getCacheHitRatio } = require('../src/frontend/usage-utils');

describe('usage utils', () => {
  describe('getDisplayInputTokens', () => {
    it('should exclude cache read and cache write tokens from displayed input', () => {
      expect(getDisplayInputTokens({
        inputTokens: 360,
        outputTokens: 30,
        cacheReadTokens: 200,
        cacheWriteTokens: 50
      })).toBe(110);
    });

    it('should preserve plain input totals when no cache usage exists', () => {
      expect(getDisplayInputTokens({
        inputTokens: 120,
        outputTokens: 45
      })).toBe(120);
    });

    it('should clamp displayed input at zero for inconsistent payloads', () => {
      expect(getDisplayInputTokens({
        inputTokens: 20,
        cacheReadTokens: 15,
        cacheWriteTokens: 10
      })).toBe(0);
    });
  });

  describe('getCacheHitRatio', () => {
    it('should calculate the ratio against readable input only', () => {
      expect(getCacheHitRatio({
        inputTokens: 360,
        cacheReadTokens: 200,
        cacheWriteTokens: 50
      })).toBe(65);
    });

    it('should preserve a rounded zero ratio when cache reads are very small', () => {
      expect(getCacheHitRatio({
        inputTokens: 1000,
        cacheReadTokens: 1,
        cacheWriteTokens: 0
      })).toBe(0);
    });

    it('should return null when there are no cache reads', () => {
      expect(getCacheHitRatio({
        inputTokens: 120,
        cacheReadTokens: 0,
        cacheWriteTokens: 0
      })).toBeNull();
    });
  });
});
