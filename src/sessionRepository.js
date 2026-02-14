const fs = require('fs').promises;
const path = require('path');
const Session = require('./session');
const { fileExists, countLines, parseYAML, shouldSkipEntry } = require('./fileUtils');

/**
 * Session Repository - Data access layer for sessions
 */
class SessionRepository {
  constructor(sessionDir) {
    this.sessionDir = sessionDir;
  }

  /**
   * Get all sessions
   * @returns {Promise<Session[]>} Array of sessions sorted by updatedAt (newest first)
   */
  async findAll() {
    const sessions = [];
    
    try {
      const entries = await fs.readdir(this.sessionDir);
      
      for (const entry of entries) {
        if (shouldSkipEntry(entry)) continue;
        
        const fullPath = path.join(this.sessionDir, entry);
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          const session = await this._createDirectorySession(entry, fullPath, stats);
          if (session) sessions.push(session);
        } else if (entry.endsWith('.jsonl')) {
          const session = await this._createFileSession(entry, fullPath, stats);
          if (session) sessions.push(session);
        }
      }
    } catch (err) {
      console.error('Error reading sessions:', err);
    }
    
    return this._sortByUpdatedAt(sessions);
  }

  /**
   * Find session by ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<Session|null>}
   */
  async findById(sessionId) {
    const sessions = await this.findAll();
    return sessions.find(s => s.id === sessionId) || null;
  }

  /**
   * Create session from directory
   * @private
   */
  async _createDirectorySession(entry, fullPath, stats) {
    const workspaceFile = path.join(fullPath, 'workspace.yaml');
    const eventsFile = path.join(fullPath, 'events.jsonl');
    
    // Check if workspace.yaml exists
    if (!await fileExists(workspaceFile)) {
      return null; // Skip directories without workspace.yaml
    }
    
    const workspace = await parseYAML(workspaceFile);
    const eventCount = await fileExists(eventsFile) ? await countLines(eventsFile) : 0;
    
    return Session.fromDirectory(fullPath, entry, stats, workspace, eventCount);
  }

  /**
   * Create session from .jsonl file
   * @private
   */
  async _createFileSession(entry, fullPath, stats) {
    const sessionId = entry.replace('.jsonl', '');
    const eventCount = await countLines(fullPath);
    
    return Session.fromFile(fullPath, sessionId, stats, eventCount);
  }

  /**
   * Sort sessions by updated time (newest first)
   * @private
   */
  _sortByUpdatedAt(sessions) {
    return sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
}

module.exports = SessionRepository;
