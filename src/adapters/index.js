/**
 * Source Adapter Registry — Central Registration Point
 *
 * To add a new source adapter:
 *   1. Create src/adapters/MyNewAdapter.js extending BaseSourceAdapter
 *   2. Import and register it below
 *   That's it — no other files need to change.
 */

const AdapterRegistry = require('./AdapterRegistry');
const BaseSourceAdapter = require('./BaseSourceAdapter');

// Concrete adapters
const CopilotAdapter = require('./CopilotAdapter');
const ClaudeAdapter = require('./ClaudeAdapter');
const PiMonoAdapter = require('./PiMonoAdapter');
const VsCodeAdapter = require('./VsCodeAdapter');

// Create singleton registry
const registry = new AdapterRegistry();

// --- Register adapters here ---
registry.register(new CopilotAdapter());
registry.register(new ClaudeAdapter());
registry.register(new PiMonoAdapter());
registry.register(new VsCodeAdapter());

module.exports = {
  registry,
  AdapterRegistry,
  BaseSourceAdapter
};
