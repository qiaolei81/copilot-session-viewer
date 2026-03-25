const path = require('path');

/**
 * Session domain model
 */
class Session {
  constructor(id, type, options = {}) {
    this.id = id;
    this.type = type; // 'directory' or 'file'
    this.source = options.source || 'copilot'; // 'copilot' or 'claude'
    this.directory = options.directory || null; // Full path to session directory
    this.filePath = options.filePath || null; // Full path to session file (for file-based sessions)
    this.workspace = options.workspace || {};
    this.createdAt = options.createdAt;
    this.updatedAt = options.updatedAt;
    this.summary = options.summary || (type === 'file' ? 'Legacy session' : 'No summary');
    this.hasEvents = options.hasEvents || false;
    this.eventCount = options.eventCount || 0;
    this.duration = options.duration || null; // Duration in milliseconds
    this.isImported = options.isImported || false; // Whether session was imported
    this.hasInsight = options.hasInsight || false; // Whether session has insight report
    this.copilotVersion = options.copilotVersion || null; // Copilot CLI version
    this.selectedModel = options.selectedModel || null; // LLM model used
    this.sessionStatus = options.sessionStatus || 'completed'; // 'completed' | 'wip'
  }

  /**
   * Create Session from directory
   * @param {string} dirPath - Directory path
   * @param {string} id - Session ID
   * @param {object} stats - fs.Stats object
   * @param {object} workspace - Parsed workspace.yaml
   * @param {number} eventCount - Number of events
   * @param {number|null} duration - Duration in milliseconds
   * @param {boolean} isImported - Whether session was imported
   * @param {boolean} hasInsight - Whether session has insight report
   * @param {string|null} copilotVersion - Copilot CLI version
   * @param {string|null} selectedModel - LLM model used
   * @param {string} sessionStatus - Session status: 'completed' or 'wip'
   * @returns {Session}
   */
  static fromDirectory(dirPath, id, stats, workspace, eventCount, duration, isImported, hasInsight, copilotVersion, selectedModel, sessionStatus) {
    const createdAt = workspace?.created_at
      ? new Date(workspace.created_at)
      : workspace?.startTime
        ? new Date(workspace.startTime)
        : stats.birthtime;
    const updatedAt = workspace?.updated_at
      ? new Date(workspace.updated_at)
      : workspace?.endTime
        ? new Date(workspace.endTime)
        : stats.mtime;
    return new Session(id, 'directory', {
      directory: dirPath, // Add directory path
      workspace: workspace,
      createdAt,
      updatedAt,
      summary: workspace?.summary || 'No summary',
      hasEvents: eventCount > 0,
      eventCount: eventCount,
      duration: duration,
      isImported: isImported,
      hasInsight: hasInsight,
      copilotVersion: copilotVersion,
      selectedModel: selectedModel,
      sessionStatus: sessionStatus
    });
  }

  /**
   * Create Session from .jsonl file
   * @param {string} filePath - File path
   * @param {string} id - Session ID
   * @param {object} stats - fs.Stats object
   * @param {number} eventCount - Number of events
   * @param {string} [summary] - Optional summary (e.g. first user message)
   * @param {number|null} duration - Duration in milliseconds
   * @param {string|null} copilotVersion - Copilot CLI version
   * @param {string|null} selectedModel - LLM model used
   * @param {string} sessionStatus - Session status: 'completed' or 'wip'
   * @returns {Session}
   */
  static fromFile(filePath, id, stats, eventCount, summary, duration, copilotVersion, selectedModel, sessionStatus) {
    return new Session(id, 'file', {
      filePath: filePath,
      directory: path.dirname(filePath), // Directory containing the file
      createdAt: stats.birthtime,
      updatedAt: stats.mtime,
      summary: summary || 'Legacy session',
      hasEvents: true,
      eventCount: eventCount,
      duration: duration,
      isImported: false, // .jsonl files can't be imported
      hasInsight: false,  // .jsonl files don't have insights
      copilotVersion: copilotVersion,
      selectedModel: selectedModel,
      sessionStatus: sessionStatus
    });
  }

  /**
   * Convert to plain object
   * @returns {object}
   */
  toJSON() {
    // Generate display-ready source metadata (Violation #3 & #5 fix)
    const sourceMetadata = this._getSourceDisplayMetadata(this.source);
    
    return {
      id: this.id,
      type: this.type,
      source: this.source,
      sourceName: sourceMetadata.name,
      sourceBadgeClass: sourceMetadata.badgeClass,
      directory: this.directory, // Include directory path
      workspace: this.workspace,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      summary: this.summary,
      hasEvents: this.hasEvents,
      eventCount: this.eventCount,
      duration: this.duration,
      isImported: this.isImported,
      hasInsight: this.hasInsight,
      copilotVersion: this.copilotVersion,
      selectedModel: this.selectedModel,
      sessionStatus: this.sessionStatus
    };
  }

  /**
   * Get display metadata for source.
   * Tries the adapter registry first, falls back to a hardcoded map for
   * backward compatibility (e.g. when registry hasn't loaded adapters yet).
   * @private
   */
  _getSourceDisplayMetadata(source) {
    // Try adapter registry first (dynamic — no code change needed for new sources)
    try {
      const { registry } = require('../adapters');
      const adapter = registry.get(source);
      if (adapter) {
        return adapter.displayMetadata;
      }
    } catch {
      // Registry not available (e.g. during early init or tests) — use fallback
    }

    // Hardcoded fallback (kept for backward compatibility)
    const metadata = {
      'copilot': { name: 'Copilot CLI', badgeClass: 'source-copilot' },
      'claude': { name: 'Claude', badgeClass: 'source-claude' },
      'pi-mono': { name: 'Pi', badgeClass: 'source-pi-mono' },
      'vscode': { name: 'Copilot Chat', badgeClass: 'source-vscode' }
    };
    return metadata[source] || { name: source, badgeClass: 'source-unknown' };
  }
}

module.exports = Session;
