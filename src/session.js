const fs = require('fs').promises;
const path = require('path');

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
  }

  /**
   * Create Session from directory
   * @param {string} dirPath - Directory path
   * @param {string} id - Session ID
   * @param {object} stats - fs.Stats object
   * @param {object} workspace - Parsed workspace.yaml
   * @param {number} eventCount - Number of events
   * @returns {Session}
   */
  static fromDirectory(dirPath, id, stats, workspace, eventCount) {
    return new Session(id, 'directory', {
      workspace: workspace,
      createdAt: workspace?.created_at || stats.birthtime,
      updatedAt: workspace?.updated_at || stats.mtime,
      summary: workspace?.summary || 'No summary',
      hasEvents: eventCount > 0,
      eventCount: eventCount
    });
  }

  /**
   * Create Session from .jsonl file
   * @param {string} filePath - File path
   * @param {string} id - Session ID
   * @param {object} stats - fs.Stats object
   * @param {number} eventCount - Number of events
   * @returns {Session}
   */
  static fromFile(filePath, id, stats, eventCount) {
    return new Session(id, 'file', {
      createdAt: stats.birthtime,
      updatedAt: stats.mtime,
      summary: 'Legacy session',
      hasEvents: true,
      eventCount: eventCount
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
      eventCount: this.eventCount
    };
  }
}

module.exports = Session;
