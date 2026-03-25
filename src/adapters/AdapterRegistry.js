/**
 * Adapter Registry
 *
 * Central registry for Source Adapters. Provides lookup by type string
 * and iteration over all registered adapters.
 *
 * Usage:
 *   const { registry } = require('../adapters');
 *   const adapter = registry.get('copilot');
 *   for (const adapter of registry.all()) { ... }
 */
class AdapterRegistry {
  constructor() {
    /** @type {Map<string, import('./BaseSourceAdapter')>} */
    this._adapters = new Map();
  }

  /**
   * Register a source adapter.
   * @param {import('./BaseSourceAdapter')} adapter
   * @throws {Error} If adapter.type is already registered
   */
  register(adapter) {
    if (this._adapters.has(adapter.type)) {
      throw new Error(`Adapter already registered for type: ${adapter.type}`);
    }
    this._adapters.set(adapter.type, adapter);
  }

  /**
   * Get adapter by source type.
   * @param {string} type - e.g. 'copilot', 'claude', 'pi-mono', 'vscode'
   * @returns {import('./BaseSourceAdapter')|null}
   */
  get(type) {
    return this._adapters.get(type) || null;
  }

  /**
   * Get all registered adapters.
   * @returns {import('./BaseSourceAdapter')[]}
   */
  all() {
    return Array.from(this._adapters.values());
  }

  /**
   * Get all registered type strings.
   * @returns {string[]}
   */
  types() {
    return Array.from(this._adapters.keys());
  }

  /**
   * Number of registered adapters.
   * @returns {number}
   */
  get size() {
    return this._adapters.size;
  }
}

module.exports = AdapterRegistry;

