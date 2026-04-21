const AdapterRegistry = require('../../src/adapters/AdapterRegistry');
const BaseSourceAdapter = require('../../src/adapters/BaseSourceAdapter');

// Helper: create a minimal concrete adapter
function createAdapter(type, displayName = type) {
  class TestAdapter extends BaseSourceAdapter {
    get type() { return type; }
    get displayName() { return displayName; }
    getDefaultDir() { return `/mock/${type}`; }
    async scanEntries() { return []; }
    async findById() { return null; }
    async resolveEventsFile() { return null; }
  }
  return new TestAdapter();
}

describe('AdapterRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  describe('register()', () => {
    it('should register an adapter', () => {
      const adapter = createAdapter('copilot', 'Copilot CLI');
      registry.register(adapter);

      expect(registry.size).toBe(1);
    });

    it('should throw if same type registered twice', () => {
      const adapter1 = createAdapter('copilot');
      const adapter2 = createAdapter('copilot');

      registry.register(adapter1);
      expect(() => registry.register(adapter2)).toThrow('already registered');
    });

    it('should allow registering multiple different types', () => {
      registry.register(createAdapter('copilot'));
      registry.register(createAdapter('claude'));
      registry.register(createAdapter('pi-mono'));

      expect(registry.size).toBe(3);
    });
  });

  describe('get()', () => {
    it('should return registered adapter by type', () => {
      const adapter = createAdapter('copilot', 'Copilot CLI');
      registry.register(adapter);

      const result = registry.get('copilot');
      expect(result).toBe(adapter);
      expect(result.displayName).toBe('Copilot CLI');
    });

    it('should return null for unknown type', () => {
      expect(registry.get('unknown')).toBeNull();
    });

    it('should return null when registry is empty', () => {
      expect(registry.get('copilot')).toBeNull();
    });
  });

  describe('all()', () => {
    it('should return empty array when no adapters registered', () => {
      expect(registry.all()).toEqual([]);
    });

    it('should return all registered adapters', () => {
      const a1 = createAdapter('copilot');
      const a2 = createAdapter('claude');
      registry.register(a1);
      registry.register(a2);

      const all = registry.all();
      expect(all).toHaveLength(2);
      expect(all).toContain(a1);
      expect(all).toContain(a2);
    });
  });

  describe('types()', () => {
    it('should return empty array when no adapters registered', () => {
      expect(registry.types()).toEqual([]);
    });

    it('should return all registered type strings', () => {
      registry.register(createAdapter('copilot'));
      registry.register(createAdapter('claude'));
      registry.register(createAdapter('vscode'));

      const types = registry.types();
      expect(types).toEqual(['copilot', 'claude', 'vscode']);
    });
  });

  describe('size', () => {
    it('should return 0 when empty', () => {
      expect(registry.size).toBe(0);
    });

    it('should reflect number of registered adapters', () => {
      registry.register(createAdapter('copilot'));
      expect(registry.size).toBe(1);
      registry.register(createAdapter('claude'));
      expect(registry.size).toBe(2);
    });
  });

  describe('detectImportCandidates()', () => {
    it('should return sorted structured results from all adapters', async () => {
      class DetectingAdapter extends BaseSourceAdapter {
        get type() { return 'copilot'; }
        get displayName() { return 'Copilot'; }
        getDefaultDir() { return '/mock/copilot'; }
        async scanEntries() { return []; }
        async findById() { return null; }
        async resolveEventsFile() { return null; }
        async detectImportCandidate() { return { matched: true, score: 90, reason: 'ok', sessionId: 'abc' }; }
      }
      class NonDetectingAdapter extends BaseSourceAdapter {
        get type() { return 'claude'; }
        get displayName() { return 'Claude'; }
        getDefaultDir() { return '/mock/claude'; }
        async scanEntries() { return []; }
        async findById() { return null; }
        async resolveEventsFile() { return null; }
      }

      registry.register(new DetectingAdapter());
      registry.register(new NonDetectingAdapter());

      const results = await registry.detectImportCandidates('/tmp/extract');
      expect(results[0]).toEqual(expect.objectContaining({ source: 'copilot', matched: true, score: 90 }));
      expect(results[1]).toEqual(expect.objectContaining({ source: 'claude', matched: false, score: 0 }));
    });

    it('should handle adapter detection errors gracefully', async () => {
      class ErrorAdapter extends BaseSourceAdapter {
        get type() { return 'bad'; }
        get displayName() { return 'Bad'; }
        getDefaultDir() { return '/mock/bad'; }
        async scanEntries() { return []; }
        async findById() { return null; }
        async resolveEventsFile() { return null; }
        async detectImportCandidate() { throw new Error('boom'); }
      }
      registry.register(new ErrorAdapter());
      const results = await registry.detectImportCandidates('/tmp/x');
      expect(results[0]).toEqual(expect.objectContaining({ source: 'bad', matched: false, reason: 'Detection error: boom' }));
    });
  });
});

