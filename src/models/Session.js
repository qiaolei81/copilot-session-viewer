/**
 * Session domain model
 */
class Session {
  constructor(id, type, options = {}) {
    this.id = id;
    this.type = type; // 'directory' or 'file'
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
    return new Session(id, 'directory', {
      workspace: workspace,
      createdAt: workspace?.created_at || stats.birthtime,
      updatedAt: workspace?.updated_at || stats.mtime,
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
    return {
      id: this.id,
      type: this.type,
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
}

module.exports = Session;
