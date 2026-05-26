const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const readline = require('readline');
const { shouldSkipEntry } = require('../utils/fileUtils');

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
   * Recursively scan a directory tree for session entries.
   * Calls `matchEntry(fullPath, entry, stats)` on each entry.
   * - If it returns a Session or Session[], those are collected.
   * - If it returns null and the entry is a directory, recurse into it.
   * - If it returns false, skip (don't recurse).
   * @param {string} dir - Directory to scan
   * @param {function} matchEntry - async (fullPath, entry, stats) => Session|Session[]|null|false
   * @param {number} [maxDepth=5] - Maximum recursion depth
   * @param {number} [_depth=0] - Current depth (internal)
   * @returns {Promise<import('../models/Session')[]>}
   */
  async recursiveScan(dir, matchEntry, maxDepth = 5, _depth = 0) {
    if (_depth > maxDepth) return [];

    let entries;
    try {
      entries = await fsPromises.readdir(dir);
    } catch {
      return [];
    }

    const tasks = entries
      .filter(entry => !shouldSkipEntry(entry))
      .map(async (entry) => {
        const fullPath = path.join(dir, entry);
        let stats;
        try {
          stats = await fsPromises.stat(fullPath);
        } catch {
          return [];
        }

        const result = await matchEntry(fullPath, entry, stats);

        if (result === false) {
          // Explicitly skip
          return [];
        }
        if (result !== null && result !== undefined) {
          // Got session(s)
          return Array.isArray(result) ? result : [result];
        }
        // null => not a session entry, recurse if directory
        if (stats.isDirectory()) {
          return this.recursiveScan(path.join(dir, entry), matchEntry, maxDepth, _depth + 1);
        }
        return [];
      });

    const results = await Promise.allSettled(tasks);
    return results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .filter(s => s !== null && s !== undefined);
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
   * Helper to read JSONL events stream
   * @param {string} eventsFile - Path to the events.jsonl file
   * @returns {Promise<Array>} Parsed events array
   */
  async readJsonlEvents(eventsFile) {
    if (!eventsFile) return [];
    
    try {
      await fs.promises.access(eventsFile);
      
      const fileStream = fs.createReadStream(eventsFile, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      let lineIndex = 0;
      const parsedEvents = [];
      
      for await (const line of rl) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          try {
            const event = JSON.parse(trimmedLine);
            event._fileIndex = lineIndex;
            parsedEvents.push(event);
          } catch (err) {
            console.error(`Error parsing line ${lineIndex + 1} in ${eventsFile}:`, err.message);
          }
        }
        lineIndex++;
      }
      
      return parsedEvents;
    } catch (err) {
      console.error('Error reading main events file:', err);
      return [];
    }
  }

  /**
   * Read and return raw events for a session.
   *
   * Adapters with a completely custom event pipeline (e.g. VSCode) should
   * override this method and return an array of raw events. Adapters that do
   * not implement a custom pipeline may leave the base implementation as-is,
   * in which case callers must not rely on any implicit fallback in
   * SessionService.
   *
   * Returning {@code null} from this method indicates that the adapter does
   * not produce events for the given session (i.e., "no events"), and should
   * not be interpreted as a request to invoke any shared JSONL pipeline.
   *
   * @param {import('../models/Session')} _session - Session object
   * @param {string} _dir - Resolved source directory
   * @returns {Promise<Array|null>} Events array, or {@code null} if the adapter
   *          does not provide events for this session.
   */
  async readEvents(_session, _dir) {
    return null;
  }

  /**
   * Whether this adapter uses a fully custom readEvents() pipeline instead of
   * relying on the default/simple behavior expected by callers.
   *
   * When true, callers should treat this adapter as owning the complete event
   * ingestion pipeline for its sessions.
   *
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

  /**
   * Inspect extracted zip and decide if this adapter can import it.
   * @param {string} _extractDir
   * @returns {Promise<{matched:boolean, score:number, reason:string, [key:string]:*}>}
   */
  async detectImportCandidate(_extractDir) {
    return { matched: false, score: 0, reason: `${this.type} import detection not implemented` };
  }

  /**
   * Import a previously matched extracted zip directory.
   * @param {Object} _detection  - from detectImportCandidate
   * @param {Object} _ctx        - { extractDir, req, targetDir? }
   * @returns {Promise<Object>}
   */
  async importDetectedSession(_detection, _ctx) {
    return { success: false, error: `Import not implemented for ${this.type}`, statusCode: 400 };
  }
}

module.exports = BaseSourceAdapter;

