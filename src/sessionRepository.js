const fs = require('fs').promises;
const path = require('path');
const Session = require('./session');
const { fileExists, countLines, parseYAML, getFirstUserMessage, getSessionDuration, getSessionMetadata, shouldSkipEntry } = require('./fileUtils');

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
    try {
      const entries = await fs.readdir(this.sessionDir);

      const tasks = entries
        .filter(entry => !shouldSkipEntry(entry))
        .map(async (entry) => {
          const fullPath = path.join(this.sessionDir, entry);
          const stats = await fs.stat(fullPath);

          if (stats.isDirectory()) {
            return this._createDirectorySession(entry, fullPath, stats);
          } else if (entry.endsWith('.jsonl')) {
            return this._createFileSession(entry, fullPath, stats);
          }
          return null;
        });

      const results = await Promise.allSettled(tasks);
      const sessions = results
        .filter(r => r.status === 'fulfilled' && r.value !== null && r.value !== undefined)
        .map(r => r.value);

      return this._sortByUpdatedAt(sessions);
    } catch (err) {
      console.error('Error reading sessions:', err);
      return [];
    }
  }

  /**
   * Find session by ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<Session|null>}
   */
  async findById(sessionId) {
    if (shouldSkipEntry(sessionId)) return null;

    try {
      // Try directory first
      const dirPath = path.join(this.sessionDir, sessionId);
      const dirStats = await fs.stat(dirPath);
      if (dirStats.isDirectory()) {
        return await this._createDirectorySession(sessionId, dirPath, dirStats);
      }
    } catch {
      // Not a directory, try .jsonl file
    }

    try {
      const filePath = path.join(this.sessionDir, `${sessionId}.jsonl`);
      const fileStats = await fs.stat(filePath);
      if (fileStats.isFile()) {
        return await this._createFileSession(`${sessionId}.jsonl`, filePath, fileStats);
      }
    } catch {
      // File not found
    }

    return null;
  }

  /**
   * Create session from directory
   * @private
   */
  async _createDirectorySession(entry, fullPath, stats) {
    const workspaceFile = path.join(fullPath, 'workspace.yaml');
    const eventsFile = path.join(fullPath, 'events.jsonl');
    const importedMarkerFile = path.join(fullPath, '.imported');
    const insightReportFile = path.join(fullPath, 'insight-report.md');

    // Check if workspace.yaml exists
    if (!await fileExists(workspaceFile)) {
      return null; // Skip directories without workspace.yaml
    }

    const workspace = await parseYAML(workspaceFile);
    const eventCount = await fileExists(eventsFile) ? await countLines(eventsFile) : 0;
    const duration = await fileExists(eventsFile) ? await getSessionDuration(eventsFile) : null;
    const isImported = await fileExists(importedMarkerFile);
    const hasInsight = await fileExists(insightReportFile);
    
    // Get session metadata (copilotVersion, selectedModel)
    const metadata = await fileExists(eventsFile) ? await getSessionMetadata(eventsFile) : { copilotVersion: null, selectedModel: null };

    // Fallback: if no summary in workspace, extract first user message from events
    if (!workspace.summary && await fileExists(eventsFile)) {
      const firstMsg = await getFirstUserMessage(eventsFile);
      if (firstMsg) {
        workspace.summary = firstMsg;
      }
    }

    return Session.fromDirectory(fullPath, entry, stats, workspace, eventCount, duration, isImported, hasInsight, metadata.copilotVersion, metadata.selectedModel);
  }

  /**
   * Create session from .jsonl file
   * @private
   */
  async _createFileSession(entry, fullPath, stats) {
    const sessionId = entry.replace('.jsonl', '');
    const eventCount = await countLines(fullPath);
    const firstMsg = await getFirstUserMessage(fullPath);
    const duration = await getSessionDuration(fullPath);
    const metadata = await getSessionMetadata(fullPath);

    return Session.fromFile(fullPath, sessionId, stats, eventCount, firstMsg, duration, metadata.copilotVersion, metadata.selectedModel);
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
