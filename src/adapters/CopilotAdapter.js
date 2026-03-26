const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const BaseSourceAdapter = require('./BaseSourceAdapter');
const Session = require('../models/Session');
const { fileExists, countLines, parseYAML, getSessionMetadataOptimized, shouldSkipEntry } = require('../utils/fileUtils');
const { computeSessionStatus } = require('./adapterUtils');

/**
 * Copilot CLI Source Adapter
 *
 * Handles sessions stored in ~/.copilot/session-state/
 * Supports both directory-based (events.jsonl + workspace.yaml) and
 * standalone .jsonl file sessions.
 */
class CopilotAdapter extends BaseSourceAdapter {
  get type() { return 'copilot'; }
  get displayName() { return 'Copilot CLI'; }
  get envVar() { return 'COPILOT_SESSION_DIR'; }

  getDefaultDir() {
    return process.env.SESSION_DIR || // Legacy fallback
           path.join(os.homedir(), '.copilot', 'session-state');
  }

  async scanEntries(dir) {
    const entries = await fs.readdir(dir);
    const tasks = entries
      .filter(entry => !shouldSkipEntry(entry))
      .map(async (entry) => {
        const fullPath = path.join(dir, entry);
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          return this._createDirectorySession(entry, fullPath, stats);
        } else if (entry.endsWith('.jsonl')) {
          return this._createFileSession(entry, fullPath, stats);
        }
        return null;
      });

    const results = await Promise.allSettled(tasks);
    return results
      .filter(r => r.status === 'fulfilled' && r.value !== null && r.value !== undefined)
      .map(r => r.value);
  }

  async findById(sessionId, dir) {
    // Try directory first
    try {
      const dirPath = path.join(dir, sessionId);
      const dirStats = await fs.stat(dirPath);
      if (dirStats.isDirectory()) {
        return await this._createDirectorySession(sessionId, dirPath, dirStats);
      }
    } catch {
      // Not a directory
    }

    // Try .jsonl file
    try {
      const filePath = path.join(dir, `${sessionId}.jsonl`);
      const fileStats = await fs.stat(filePath);
      if (fileStats.isFile()) {
        return await this._createFileSession(`${sessionId}.jsonl`, filePath, fileStats);
      }
    } catch {
      // File not found
    }

    return null;
  }

  async resolveEventsFile(session, dir) {
    const sessionId = session.id;
    const sessionPath = path.join(dir, sessionId);
    try {
      const stats = await fs.stat(sessionPath);
      if (stats.isDirectory()) {
        return path.join(sessionPath, 'events.jsonl');
      } else {
        return path.join(dir, `${sessionId}.jsonl`);
      }
    } catch (_err) {
      return path.join(dir, `${sessionId}.jsonl`);
    }
  }

  async readEvents(session, dir) {
    const eventsFile = await this.resolveEventsFile(session, dir);
    return this.readJsonlEvents(eventsFile);
  }

  async _createDirectorySession(entry, fullPath, stats) {
    const workspaceFile = path.join(fullPath, 'workspace.yaml');
    const eventsFile = path.join(fullPath, 'events.jsonl');
    const importedMarkerFile = path.join(fullPath, '.imported');
    const insightReportFile = path.join(fullPath, `${entry}.agent-review.md`);

    const workspace = await fileExists(workspaceFile)
      ? await parseYAML(workspaceFile)
      : { summary: entry, repo: 'unknown' };

    const eventCount = await fileExists(eventsFile) ? await countLines(eventsFile) : 0;
    const isImported = await fileExists(importedMarkerFile);
    const hasInsight = await fileExists(insightReportFile);

    let duration = null;
    let copilotVersion = null;
    let selectedModel = null;
    let sessionStatus = 'completed';

    if (await fileExists(eventsFile)) {
      const optimizedMetadata = await getSessionMetadataOptimized(eventsFile);
      duration = optimizedMetadata.duration;
      copilotVersion = optimizedMetadata.copilotVersion;
      selectedModel = optimizedMetadata.selectedModel;
      sessionStatus = computeSessionStatus(optimizedMetadata);

      if (!workspace.summary && optimizedMetadata.firstUserMessage) {
        workspace.summary = optimizedMetadata.firstUserMessage;
      }

      if (optimizedMetadata.lastEventTime) {
        const lastEventMs = new Date(optimizedMetadata.lastEventTime).getTime();
        const mtimeMs = new Date(stats.mtime).getTime();
        if (lastEventMs > mtimeMs) {
          stats = { ...stats, mtime: new Date(lastEventMs) };
        }
      }
    }

    const session = Session.fromDirectory(fullPath, entry, stats, workspace, eventCount, duration, isImported, hasInsight, copilotVersion, selectedModel, sessionStatus);
    session.source = 'copilot';
    return session;
  }

  async _createFileSession(entry, fullPath, stats) {
    const sessionId = entry.replace('.jsonl', '');
    const eventCount = await countLines(fullPath);

    const optimizedMetadata = await getSessionMetadataOptimized(fullPath);
    const sessionStatus = computeSessionStatus(optimizedMetadata);

    const session = Session.fromFile(
      fullPath, sessionId, stats, eventCount,
      optimizedMetadata.firstUserMessage,
      optimizedMetadata.duration,
      optimizedMetadata.copilotVersion,
      optimizedMetadata.selectedModel,
      sessionStatus
    );
    session.source = 'copilot';
    return session;
  }
}

module.exports = CopilotAdapter;
