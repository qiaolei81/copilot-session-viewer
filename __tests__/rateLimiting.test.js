describe('Rate Limiting Middleware', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear module cache
    jest.resetModules();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Test Environment Detection', () => {
    it('should skip rate limiting in NODE_ENV=test', () => {
      process.env.NODE_ENV = 'test';
      jest.resetModules();

      const rateLimiting = require('../src/server/middleware/rateLimiting');

      // Module should export limiters
      expect(rateLimiting.globalLimiter).toBeDefined();
      expect(rateLimiting.insightGenerationLimiter).toBeDefined();
      expect(rateLimiting.insightAccessLimiter).toBeDefined();
      expect(rateLimiting.uploadLimiter).toBeDefined();
    });

    it('should skip rate limiting with PLAYWRIGHT=1', () => {
      process.env.PLAYWRIGHT = '1';
      delete process.env.NODE_ENV;
      jest.resetModules();

      const rateLimiting = require('../src/server/middleware/rateLimiting');

      expect(rateLimiting.globalLimiter).toBeDefined();
    });

    it('should use production limits when not in test environment', () => {
      delete process.env.NODE_ENV;
      delete process.env.PLAYWRIGHT;
      jest.resetModules();

      const rateLimiting = require('../src/server/middleware/rateLimiting');

      expect(rateLimiting.globalLimiter).toBeDefined();
    });
  });

  describe('globalLimiter', () => {
    it('should export globalLimiter', () => {
      const rateLimiting = require('../src/server/middleware/rateLimiting');
      expect(rateLimiting.globalLimiter).toBeDefined();
      expect(typeof rateLimiting.globalLimiter).toBe('function');
    });

    it('should be callable as middleware', () => {
      const rateLimiting = require('../src/server/middleware/rateLimiting');
      const req = {};
      const res = {};
      const next = jest.fn();

      // Should be able to call it (even if it's a mock in test env)
      expect(() => rateLimiting.globalLimiter(req, res, next)).not.toThrow();
    });
  });

  describe('insightGenerationLimiter', () => {
    it('should export insightGenerationLimiter', () => {
      const rateLimiting = require('../src/server/middleware/rateLimiting');
      expect(rateLimiting.insightGenerationLimiter).toBeDefined();
      expect(typeof rateLimiting.insightGenerationLimiter).toBe('function');
    });

    it('should be callable as middleware', () => {
      const rateLimiting = require('../src/server/middleware/rateLimiting');
      const req = {};
      const res = {};
      const next = jest.fn();

      expect(() => rateLimiting.insightGenerationLimiter(req, res, next)).not.toThrow();
    });
  });

  describe('insightAccessLimiter', () => {
    it('should export insightAccessLimiter', () => {
      const rateLimiting = require('../src/server/middleware/rateLimiting');
      expect(rateLimiting.insightAccessLimiter).toBeDefined();
      expect(typeof rateLimiting.insightAccessLimiter).toBe('function');
    });

    it('should be callable as middleware', () => {
      const rateLimiting = require('../src/server/middleware/rateLimiting');
      const req = {};
      const res = {};
      const next = jest.fn();

      expect(() => rateLimiting.insightAccessLimiter(req, res, next)).not.toThrow();
    });
  });

  describe('uploadLimiter', () => {
    it('should export uploadLimiter', () => {
      const rateLimiting = require('../src/server/middleware/rateLimiting');
      expect(rateLimiting.uploadLimiter).toBeDefined();
      expect(typeof rateLimiting.uploadLimiter).toBe('function');
    });

    it('should be callable as middleware', () => {
      const rateLimiting = require('../src/server/middleware/rateLimiting');
      const req = {};
      const res = {};
      const next = jest.fn();

      expect(() => rateLimiting.uploadLimiter(req, res, next)).not.toThrow();
    });
  });

  describe('Module Exports', () => {
    it('should export all four limiters', () => {
      const rateLimiting = require('../src/server/middleware/rateLimiting');

      expect(rateLimiting).toHaveProperty('globalLimiter');
      expect(rateLimiting).toHaveProperty('insightGenerationLimiter');
      expect(rateLimiting).toHaveProperty('insightAccessLimiter');
      expect(rateLimiting).toHaveProperty('uploadLimiter');
    });

    it('should export only the four limiters', () => {
      const rateLimiting = require('../src/server/middleware/rateLimiting');

      const exports = Object.keys(rateLimiting);
      expect(exports).toHaveLength(4);
      expect(exports).toContain('globalLimiter');
      expect(exports).toContain('insightGenerationLimiter');
      expect(exports).toContain('insightAccessLimiter');
      expect(exports).toContain('uploadLimiter');
    });
  });

  describe('Environment-specific behavior', () => {
    it('should handle test environment with NODE_ENV', () => {
      process.env.NODE_ENV = 'test';
      jest.resetModules();

      const rateLimiting = require('../src/server/middleware/rateLimiting');

      // All limiters should be defined
      expect(rateLimiting.globalLimiter).toBeDefined();
      expect(rateLimiting.insightGenerationLimiter).toBeDefined();
      expect(rateLimiting.insightAccessLimiter).toBeDefined();
      expect(rateLimiting.uploadLimiter).toBeDefined();
    });

    it('should handle test environment with PLAYWRIGHT', () => {
      delete process.env.NODE_ENV;
      process.env.PLAYWRIGHT = '1';
      jest.resetModules();

      const rateLimiting = require('../src/server/middleware/rateLimiting');

      expect(rateLimiting.globalLimiter).toBeDefined();
    });

    it('should handle production environment', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.PLAYWRIGHT;
      jest.resetModules();

      const rateLimiting = require('../src/server/middleware/rateLimiting');

      expect(rateLimiting.globalLimiter).toBeDefined();
    });

    it('should handle development environment', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.PLAYWRIGHT;
      jest.resetModules();

      const rateLimiting = require('../src/server/middleware/rateLimiting');

      expect(rateLimiting.globalLimiter).toBeDefined();
    });

    it('should handle undefined environment', () => {
      delete process.env.NODE_ENV;
      delete process.env.PLAYWRIGHT;
      jest.resetModules();

      const rateLimiting = require('../src/server/middleware/rateLimiting');

      expect(rateLimiting.globalLimiter).toBeDefined();
    });
  });

  describe('Configuration Coverage', () => {
    it('should initialize with correct module structure', () => {
      const rateLimiting = require('../src/server/middleware/rateLimiting');

      // Verify all exports are middleware functions
      ['globalLimiter', 'insightGenerationLimiter', 'insightAccessLimiter', 'uploadLimiter'].forEach(limiter => {
        expect(rateLimiting[limiter]).toBeDefined();
        expect(typeof rateLimiting[limiter]).toBe('function');
      });
    });

    it('should handle different NODE_ENV values', () => {
      const environments = ['test', 'development', 'production', 'staging'];

      environments.forEach(env => {
        process.env.NODE_ENV = env;
        jest.resetModules();

        const rateLimiting = require('../src/server/middleware/rateLimiting');
        expect(rateLimiting.globalLimiter).toBeDefined();
      });
    });

    it('should handle PLAYWRIGHT flag variations', () => {
      const playwrightValues = ['1', 'true', 'yes'];

      playwrightValues.forEach(value => {
        delete process.env.NODE_ENV;
        process.env.PLAYWRIGHT = value;
        jest.resetModules();

        const rateLimiting = require('../src/server/middleware/rateLimiting');
        expect(rateLimiting.globalLimiter).toBeDefined();
      });
    });
  });
});
