const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const CopilotAdapter = require('./CopilotAdapter');

/**
 * Modernize CLI Source Adapter
 *
 * Handles sessions stored in ~/.modernize/configuration/<version>+<hash>/session-state/
 * where each <version>+<hash> directory represents a different Modernize CLI version.
 * Sessions may exist across multiple version directories.
 *
 * Log format is identical to Copilot CLI, so this adapter extends CopilotAdapter
 * and only overrides identity, directory resolution, and scanning logic.
 */
class ModernizeAdapter extends CopilotAdapter {
  get type() { return 'modernize'; }
  get displayName() { return 'Modernize CLI'; }
  get envVar() { return 'MODERNIZE_SESSION_DIR'; }

  getDefaultDir() {
    return path.join(os.homedir(), '.modernize', 'configuration');
  }

  /**
   * Resolve the base configuration directory.
   * Returns the env var override (pointing directly to a session-state dir)
   * or the default configuration directory (parent of all version dirs).
   */
  async resolveDir() {
    if (this.envVar && process.env[this.envVar]) {
      return process.env[this.envVar];
    }
    return this.getDefaultDir();
  }

  /**
   * Find all session-state directories across all version+hash subdirectories.
   * @param {string} configDir - The configuration directory
   * @returns {Promise<string[]>} Array of session-state directory paths
   */
  async _findSessionStateDirs(configDir) {
    const dirs = [];
    try {
      const entries = await fs.readdir(configDir);
      for (const entry of entries) {
        if (!entry.includes('+')) continue;
        const sessionStateDir = path.join(configDir, entry, 'session-state');
        try {
          const stats = await fs.stat(sessionStateDir);
          if (stats.isDirectory()) {
            dirs.push(sessionStateDir);
          }
        } catch {
          // No session-state in this version dir
        }
      }
    } catch {
      // Config dir doesn't exist or isn't readable
    }
    return dirs;
  }

  /**
   * Determine whether dir is an env-var override (direct session-state path)
   * or the default config dir containing version+hash subdirectories.
   */
  _isEnvVarOverride() {
    return !!(this.envVar && process.env[this.envVar]);
  }

  /**
   * Scan all version+hash/session-state directories for sessions.
   */
  async scanEntries(dir) {
    // When env var points directly to a session-state dir, scan it directly
    if (this._isEnvVarOverride()) {
      return this._scanAndTag(dir);
    }

    // Otherwise, scan all version subdirectories
    const sessionStateDirs = await this._findSessionStateDirs(dir);
    const allSessions = [];
    for (const ssDir of sessionStateDirs) {
      const sessions = await this._scanAndTag(ssDir);
      allSessions.push(...sessions);
    }
    return allSessions;
  }

  /**
   * Extract the Modernize CLI version from a session-state directory path.
   * Path pattern: <configDir>/<version>+<hash>/session-state
   * @param {string} sessionStateDir
   * @returns {string|null} e.g. "0.0.226"
   */
  _extractModernizeVersion(sessionStateDir) {
    // Parent of session-state is the version+hash directory
    const versionHashDir = path.basename(path.dirname(sessionStateDir));
    const plusIndex = versionHashDir.indexOf('+');
    if (plusIndex > 0) {
      return versionHashDir.substring(0, plusIndex);
    }
    return null;
  }

  /**
   * Scan a single session-state directory and tag results as modernize.
   */
  async _scanAndTag(sessionStateDir) {
    try {
      const modernizeVersion = this._extractModernizeVersion(sessionStateDir);
      const sessions = await super.scanEntries(sessionStateDir);
      for (const session of sessions) {
        session.source = 'modernize';
        session.modernizeVersion = modernizeVersion;
      }
      return sessions;
    } catch {
      return [];
    }
  }

  /**
   * Search all version directories for a session by ID.
   */
  async findById(sessionId, dir) {
    if (this._isEnvVarOverride()) {
      return this._findByIdInDir(sessionId, dir);
    }

    const sessionStateDirs = await this._findSessionStateDirs(dir);
    for (const ssDir of sessionStateDirs) {
      const session = await this._findByIdInDir(sessionId, ssDir);
      if (session) return session;
    }
    return null;
  }

  async _findByIdInDir(sessionId, sessionStateDir) {
    const session = await super.findById(sessionId, sessionStateDir);
    if (session) {
      session.source = 'modernize';
      session.modernizeVersion = this._extractModernizeVersion(sessionStateDir);
    }
    return session;
  }

  /**
   * Resolve events file across all version directories.
   */
  async resolveEventsFile(session, dir) {
    if (this._isEnvVarOverride()) {
      return super.resolveEventsFile(session, dir);
    }

    const sessionStateDirs = await this._findSessionStateDirs(dir);
    for (const ssDir of sessionStateDirs) {
      try {
        const eventsFile = await super.resolveEventsFile(session, ssDir);
        await fs.access(eventsFile);
        return eventsFile;
      } catch {
        // Not in this version dir
      }
    }
    return null;
  }

  /**
   * Read events, searching across all version directories.
   */
  async readEvents(session, dir) {
    const eventsFile = await this.resolveEventsFile(session, dir);
    return this.readJsonlEvents(eventsFile);
  }

  // Source tagging overrides — these are called by super.scanEntries()
  // which we already wrap in _scanAndTag, but keep them for direct calls
  async _createDirectorySession(entry, fullPath, stats) {
    const session = await super._createDirectorySession(entry, fullPath, stats);
    if (session) {
      session.source = 'modernize';
    }
    return session;
  }

  async _createFileSession(entry, fullPath, stats) {
    const session = await super._createFileSession(entry, fullPath, stats);
    if (session) {
      session.source = 'modernize';
    }
    return session;
  }

  // Modernize uses the same format as Copilot but shouldn't claim zip imports;
  // Copilot adapter handles the generic events.jsonl-directory format.
  async detectImportCandidate(_extractDir) {
    return { matched: false, score: 0, reason: 'Modernize does not support zip import (use Copilot)' };
  }
}

module.exports = ModernizeAdapter;
