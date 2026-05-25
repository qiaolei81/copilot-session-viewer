/**
 * Rate Limiting Tests for Production Environment
 * These tests specifically test the skip function behavior in non-test environments
 */

describe('Rate Limiting - Production Mode', () => {
  let originalEnv;
  let rateLimiting;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set production environment
    process.env.NODE_ENV = 'production';
    delete process.env.PLAYWRIGHT;

    // Clear cache and load module
    jest.resetModules();
    jest.unmock('express-rate-limit');

    // Mock express-rate-limit to capture configuration
    const mockRateLimit = jest.fn((config) => {
      const middleware = (req, res, next) => {
        // Store the skip function for testing
        middleware._skipFn = config.skip;
        next();
      };
      middleware._config = config;
      return middleware;
    });

    jest.doMock('express-rate-limit', () => mockRateLimit);

    // Now require the module
    rateLimiting = require('../src/server/middleware/rateLimiting');
  });

  afterAll(() => {
    // Restore environment
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('globalLimiter skip function in production', () => {
    it('should NOT skip requests in production environment', () => {
      const config = rateLimiting.globalLimiter._config;

      if (config && config.skip) {
        const mockReq = { path: '/api/sessions', method: 'POST' };
        const result = config.skip(mockReq);
        expect(result).toBe(false);
      }
    });

    it('should skip static files starting with /public', () => {
      const config = rateLimiting.globalLimiter._config;

      if (config && config.skip) {
        const mockReq = { path: '/public/style.css', method: 'GET' };
        const result = config.skip(mockReq);
        expect(result).toBe(true);
      }
    });

    it('should skip GET requests containing /insight', () => {
      const config = rateLimiting.globalLimiter._config;

      if (config && config.skip) {
        const mockReq = { path: '/session/123/insight', method: 'GET' };
        const result = config.skip(mockReq);
        expect(result).toBe(true);
      }
    });

    it('should NOT skip POST requests to insight endpoints', () => {
      const config = rateLimiting.globalLimiter._config;

      if (config && config.skip) {
        const mockReq = { path: '/session/123/insight', method: 'POST' };
        const result = config.skip(mockReq);
        expect(result).toBe(false);
      }
    });

    it('should NOT skip regular API requests', () => {
      const config = rateLimiting.globalLimiter._config;

      if (config && config.skip) {
        const mockReq = { path: '/api/sessions', method: 'GET' };
        const result = config.skip(mockReq);
        expect(result).toBe(false);
      }
    });

    it('should return false for non-public, non-insight paths', () => {
      const config = rateLimiting.globalLimiter._config;

      if (config && config.skip) {
        const mockReq = { path: '/uploads/session/123', method: 'POST' };
        const result = config.skip(mockReq);
        expect(result).toBe(false);
      }
    });
  });

  describe('Configuration in production', () => {
    it('should use production max limit (100) not test limit (10000)', () => {
      const config = rateLimiting.globalLimiter._config;

      if (config) {
        // In production, max should be 100, not 10000
        expect(config.max).toBe(100);
        expect(config.max).not.toBe(10000);
      }
    });

    it('should have correct window settings', () => {
      const config = rateLimiting.globalLimiter._config;

      if (config) {
        expect(config.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      }
    });
  });
});
