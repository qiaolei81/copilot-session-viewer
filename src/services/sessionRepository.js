const fs = require('fs').promises;
const path = require('path');
const Session = require('../models/Session');
const { fileExists, countLines, parseYAML, getSessionMetadataOptimized, shouldSkipEntry } = require('../utils/fileUtils');

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
    const isImported = await fileExists(importedMarkerFile);
    const hasInsight = await fileExists(insightReportFile);

    let duration = null;
    let copilotVersion = null;
    let selectedModel = null;

    // Use optimized metadata extraction if events file exists
    if (await fileExists(eventsFile)) {
      const optimizedMetadata = await getSessionMetadataOptimized(eventsFile);
      duration = optimizedMetadata.duration;
      copilotVersion = optimizedMetadata.copilotVersion;
      selectedModel = optimizedMetadata.selectedModel;

      // Fallback: if no summary in workspace, use first user message from optimized read
      if (!workspace.summary && optimizedMetadata.firstUserMessage) {
        workspace.summary = optimizedMetadata.firstUserMessage;
      }
    }

    return Session.fromDirectory(fullPath, entry, stats, workspace, eventCount, duration, isImported, hasInsight, copilotVersion, selectedModel);
  }

  /**
   * Create session from .jsonl file
   * @private
   */
  async _createFileSession(entry, fullPath, stats) {
    const sessionId = entry.replace('.jsonl', '');
    const eventCount = await countLines(fullPath);

    // Use optimized single-pass metadata extraction
    const optimizedMetadata = await getSessionMetadataOptimized(fullPath);

    return Session.fromFile(
      fullPath,
      sessionId,
      stats,
      eventCount,
      optimizedMetadata.firstUserMessage,
      optimizedMetadata.duration,
      optimizedMetadata.copilotVersion,
      optimizedMetadata.selectedModel
    );
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
