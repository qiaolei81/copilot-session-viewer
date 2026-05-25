/**
 * Client-side source mapping — maps internal adapter source types to URL params
 * and vice versa. Mirrors src/server/utils/sourceMapping.js.
 */

const ADAPTER_TO_URL = {
  copilot:   'copilot-cli',
  vscode:    'copilot-chat',
  claude:    'claude',
  modernize: 'modernize',
  'pi-mono': 'pi-mono',
};

const URL_TO_ADAPTER = {};
for (const [adapter, url] of Object.entries(ADAPTER_TO_URL)) {
  URL_TO_ADAPTER[url] = adapter;
}

/**
 * Convert internal adapter source type to URL path param.
 * @param {string} adapterType - e.g. 'copilot', 'vscode', 'claude'
 * @returns {string} URL source param, e.g. 'copilot-cli', 'copilot-chat'
 */
export function toUrlSource(adapterType) {
  return ADAPTER_TO_URL[adapterType] || adapterType;
}

/**
 * Convert URL source param to internal adapter type.
 * @param {string} urlSource
 * @returns {string}
 */
export function toAdapterType(urlSource) {
  return URL_TO_ADAPTER[urlSource] || urlSource;
}
