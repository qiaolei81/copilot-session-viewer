/**
 * Source Mapping — maps URL :source param to internal adapter types
 *
 * URL param      -> Adapter type
 * copilot-cli    -> copilot
 * copilot-chat   -> vscode
 * claude         -> claude
 * modernize      -> modernize
 * pi-mono        -> pi-mono
 */

const SOURCE_MAP = {
  'copilot-cli':  { adapterType: 'copilot',   label: 'Copilot CLI' },
  'copilot-chat': { adapterType: 'vscode',    label: 'Copilot Chat (VS Code)' },
  'claude':       { adapterType: 'claude',     label: 'Claude Code' },
  'modernize':    { adapterType: 'modernize',  label: 'Modernize' },
  'pi-mono':      { adapterType: 'pi-mono',    label: 'Pi Mono' },
};

const VALID_SOURCES = new Set(Object.keys(SOURCE_MAP));

/**
 * Resolve a URL source param to the internal adapter type.
 * @param {string} urlParam - The :source URL parameter
 * @returns {string|null} The adapter type, or null if invalid
 */
function resolveSource(urlParam) {
  const entry = SOURCE_MAP[urlParam];
  return entry ? entry.adapterType : null;
}

/**
 * Get all available sources with id and label.
 * @returns {Array<{id: string, label: string}>}
 */
function getAllSources() {
  return Object.entries(SOURCE_MAP).map(([id, { label }]) => ({ id, label }));
}

/**
 * Check if a source param is valid.
 * @param {string} urlParam
 * @returns {boolean}
 */
function isValidSource(urlParam) {
  return VALID_SOURCES.has(urlParam);
}

module.exports = { resolveSource, getAllSources, isValidSource, SOURCE_MAP };
