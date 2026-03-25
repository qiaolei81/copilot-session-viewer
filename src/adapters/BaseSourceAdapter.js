/**
 * Base Source Adapter Interface
 *
 * All source adapters (Copilot, Claude, Pi-Mono, VSCode, etc.) must extend
 * this class and implement the abstract methods. This enables the Source
 * Adapter pattern: SessionRepository and SessionService delegate all
 * source-specific logic to the appropriate adapter, eliminating if/else
 * branching across the codebase.
 *
 * To add a new source:
 *   1. Create a new adapter extending BaseSourceAdapter
 *   2. Register it in src/adapters/index.js
 *   That's it — no changes to SessionRepository, SessionService, or controllers.
 */
class BaseSourceAdapter {
  /**
   * Unique source type identifier.
   * @returns {string} e.g. 'copilot', 'claude', 'pi-mono', 'vscode'
   */
  get type() {
    throw new Error('BaseSourceAdapter: type getter must be implemented');
  }

  /**
   * Human-readable display name shown in the UI.
   * @returns {string} e.g. 'Copilot CLI', 'Claude'
   */
  get displayName() {
    throw new Error('BaseSourceAdapter: displayName getter must be implemented');
  }

  /**
   * CSS badge class for the source badge in views.
   * Default: 'source-<type>'. Override if a different class is needed.
   * @returns {string}
   */
  get badgeClass() {
    return `source-${this.type}`;
  }

  /**
   * Environment variable name that overrides the default directory.
   * Return undefined if no env var is supported.
   * @returns {string|undefined}
   */
  get envVar() {
    return undefined;
  }

  /**
   * Display metadata for Session.toJSON().
   * @returns {{ name: string, badgeClass: string }}
   */
  get displayMetadata() {
    return { name: this.displayName, badgeClass: this.badgeClass };
  }

  /**
   * Default filesystem path for this source's session data.
   * @returns {string}
   */
  getDefaultDir() {
    throw new Error('BaseSourceAdapter: getDefaultDir() must be implemented');
  }

  /**
   * Resolve the actual directory to scan. Checks env var override first,
   * then falls back to getDefaultDir(). Override for sources with multiple
   * candidates (e.g. VSCode stable vs Insiders).
   * @returns {Promise<string|null>}
   */
  async resolveDir() {
    if (this.envVar && process.env[this.envVar]) {
      return process.env[this.envVar];
    }
    return this.getDefaultDir();
  }

  /**
   * Scan the source directory and return Session objects.
   * @param {string} _dir - Resolved source directory
   * @returns {Promise<import('../models/Session')[]>}
   */
  async scanEntries(_dir) {
    throw new Error('BaseSourceAdapter: scanEntries() must be implemented');
  }

  /**
   * Find a specific session by ID within this source.
   * @param {string} _sessionId - Session ID
   * @param {string} _dir - Resolved source directory
   * @returns {Promise<import('../models/Session')|null>}
   */
  async findById(_sessionId, _dir) {
    throw new Error('BaseSourceAdapter: findById() must be implemented');
  }

  /**
   * Resolve the events file path for a given session.
   * @param {import('../models/Session')} _session - Session object
   * @param {string} _dir - Resolved source directory
   * @returns {Promise<string|null>}
   */
  async resolveEventsFile(_session, _dir) {
    throw new Error('BaseSourceAdapter: resolveEventsFile() must be implemented');
  }

  /**
   * Read and return raw events for a session. Override this for sources
   * with a completely custom event pipeline (e.g. VSCode). Return null
   * to use the shared JSONL pipeline in SessionService.
   * @param {import('../models/Session')} _session - Session object
   * @param {string} _dir - Resolved source directory
   * @returns {Promise<Array|null>} Events array, or null to use shared pipeline
   */
  async readEvents(_session, _dir) {
    return null;
  }

  /**
   * Whether this adapter uses a fully custom readEvents() pipeline
   * that bypasses the shared JSONL streaming in SessionService.
   * @returns {boolean}
   */
  get hasCustomPipeline() {
    return false;
  }

  /**
   * Source-specific event normalization.
   * @param {Object} _event - Raw event object
   * @returns {Object} Normalized event
   */
  normalizeEvent(_event) {
    return _event;
  }

  /**
   * Match tool call/result pairs within the events array (mutates in-place).
   * @param {Array} _events - Events array
   */
  matchToolCalls(_events) {
    // Default: no-op
  }

  /**
   * Expand events into timeline-compatible format.
   * @param {Array} events - Events array
   * @returns {Array} Expanded events
   */
  expandToTimelineFormat(events) {
    return events;
  }

  /**
   * Resolve and merge sub-agent events into the main events array.
   * @param {Array} _events - Main events array (mutated in-place)
   * @param {string|null} _mainEventsFile - Path to main events file
   * @param {string} _sessionId - Session ID
   * @param {string} _dir - Resolved source directory
   * @returns {Promise<void>}
   */
  async mergeSubAgentEvents(_events, _mainEventsFile, _sessionId, _dir) {
    // Default: no-op
  }

  /**
   * Build unified timeline structure from events and session.
   * @param {Array} _events - Normalized events
   * @param {import('../models/Session')} _session - Session object
   * @returns {Object} Timeline data with turns, summary, etc.
   */
  buildTimeline(_events, _session) {
    return { turns: [], summary: {} };
  }

  /**
   * Locate session files on disk (for upload/import features).
   * @param {string} _sessionId - Session ID
   * @param {string} _baseDir - Base directory to search
   * @returns {Promise<Object|null>} Location info or null
   */
  async findSessionLocation(_sessionId, _baseDir) {
    return null;
  }

  /**
   * Resolve file/directory path for zip export.
   * @param {import('../models/Session')} _session - Session object
   * @param {string} _dir - Resolved source directory
   * @returns {Promise<{ path: string, isDirectory: boolean }|null>}
   */
  async resolveExportPath(_session, _dir) {
    return null;
  }
}

module.exports = BaseSourceAdapter;

