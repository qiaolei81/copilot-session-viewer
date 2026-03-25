const BaseSourceAdapter = require('../../src/adapters/BaseSourceAdapter');

describe('BaseSourceAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new BaseSourceAdapter();
  });

  describe('abstract methods throw errors', () => {
    it('type getter should throw', () => {
      expect(() => adapter.type).toThrow('must be implemented');
    });

    it('displayName getter should throw', () => {
      expect(() => adapter.displayName).toThrow('must be implemented');
    });

    it('getDefaultDir() should throw', () => {
      expect(() => adapter.getDefaultDir()).toThrow('must be implemented');
    });

    it('scanEntries() should throw', async () => {
      await expect(adapter.scanEntries('/some/dir')).rejects.toThrow('must be implemented');
    });

    it('findById() should throw', async () => {
      await expect(adapter.findById('test-id', '/dir')).rejects.toThrow('must be implemented');
    });

    it('resolveEventsFile() should throw', async () => {
      await expect(adapter.resolveEventsFile({}, '/dir')).rejects.toThrow('must be implemented');
    });
  });

  describe('default implementations (no-ops)', () => {
    it('badgeClass should default to source-<type>', () => {
      // Create a concrete subclass to test badgeClass
      class TestAdapter extends BaseSourceAdapter {
        get type() { return 'test-source'; }
        get displayName() { return 'Test'; }
        getDefaultDir() { return '/tmp'; }
      }
      const testAdapter = new TestAdapter();
      expect(testAdapter.badgeClass).toBe('source-test-source');
    });

    it('envVar should return undefined by default', () => {
      expect(adapter.envVar).toBeUndefined();
    });

    it('hasCustomPipeline should return false by default', () => {
      expect(adapter.hasCustomPipeline).toBe(false);
    });

    it('readEvents() should return null by default', async () => {
      const result = await adapter.readEvents({}, '/dir');
      expect(result).toBeNull();
    });

    it('normalizeEvent() should return event unchanged', () => {
      const event = { type: 'test', data: 'value' };
      expect(adapter.normalizeEvent(event)).toBe(event);
    });

    it('matchToolCalls() should be a no-op', () => {
      const events = [{ type: 'a' }];
      adapter.matchToolCalls(events);
      expect(events).toEqual([{ type: 'a' }]);
    });

    it('expandToTimelineFormat() should return events unchanged', () => {
      const events = [{ type: 'a' }];
      expect(adapter.expandToTimelineFormat(events)).toBe(events);
    });

    it('mergeSubAgentEvents() should be a no-op', async () => {
      const events = [{ type: 'a' }];
      await adapter.mergeSubAgentEvents(events, null, 'id', '/dir');
      expect(events).toEqual([{ type: 'a' }]);
    });

    it('buildTimeline() should return empty turns', () => {
      const result = adapter.buildTimeline([], {});
      expect(result).toEqual({ turns: [], summary: {} });
    });

    it('findSessionLocation() should return null', async () => {
      const result = await adapter.findSessionLocation('id', '/dir');
      expect(result).toBeNull();
    });

    it('resolveExportPath() should return null', async () => {
      const result = await adapter.resolveExportPath({}, '/dir');
      expect(result).toBeNull();
    });
  });

  describe('displayMetadata', () => {
    it('should combine displayName and badgeClass', () => {
      class TestAdapter extends BaseSourceAdapter {
        get type() { return 'my-tool'; }
        get displayName() { return 'My Tool'; }
        getDefaultDir() { return '/tmp'; }
      }
      const testAdapter = new TestAdapter();
      expect(testAdapter.displayMetadata).toEqual({
        name: 'My Tool',
        badgeClass: 'source-my-tool'
      });
    });
  });

  describe('resolveDir()', () => {
    it('should use env var when set', async () => {
      class TestAdapter extends BaseSourceAdapter {
        get type() { return 'test'; }
        get displayName() { return 'Test'; }
        get envVar() { return 'TEST_SESSION_DIR'; }
        getDefaultDir() { return '/default/path'; }
      }
      const testAdapter = new TestAdapter();

      const originalEnv = process.env.TEST_SESSION_DIR;
      process.env.TEST_SESSION_DIR = '/custom/path';
      try {
        const dir = await testAdapter.resolveDir();
        expect(dir).toBe('/custom/path');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.TEST_SESSION_DIR;
        } else {
          process.env.TEST_SESSION_DIR = originalEnv;
        }
      }
    });

    it('should fall back to getDefaultDir() when env var not set', async () => {
      class TestAdapter extends BaseSourceAdapter {
        get type() { return 'test'; }
        get displayName() { return 'Test'; }
        get envVar() { return 'NONEXISTENT_ENV_VAR_FOR_TEST'; }
        getDefaultDir() { return '/default/path'; }
      }
      const testAdapter = new TestAdapter();

      delete process.env.NONEXISTENT_ENV_VAR_FOR_TEST;
      const dir = await testAdapter.resolveDir();
      expect(dir).toBe('/default/path');
    });

    it('should fall back to getDefaultDir() when envVar is undefined', async () => {
      class TestAdapter extends BaseSourceAdapter {
        get type() { return 'test'; }
        get displayName() { return 'Test'; }
        getDefaultDir() { return '/default/path'; }
      }
      const testAdapter = new TestAdapter();

      const dir = await testAdapter.resolveDir();
      expect(dir).toBe('/default/path');
    });
  });
});

