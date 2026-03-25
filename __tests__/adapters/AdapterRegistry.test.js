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
});

