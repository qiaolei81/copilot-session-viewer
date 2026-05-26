const path = require('path');
const os = require('os');
const fsSync = require('fs');
const fs = fsSync.promises;
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
    return this.recursiveScan(dir, async (fullPath, entry, stats) => {
      if (stats.isDirectory()) {
        const hasEvents = await fileExists(path.join(fullPath, 'events.jsonl'));
        const hasWorkspace = await fileExists(path.join(fullPath, 'workspace.yaml'));
        if (hasEvents || hasWorkspace) {
          return this._createDirectorySession(entry, fullPath, stats);
        }
        return null; // recurse
      } else if (entry.endsWith('.jsonl')) {
        return this._createFileSession(entry, fullPath, stats);
      }
      return false; // skip non-jsonl files
    });
  }

  async findById(sessionId, dir) {
    // Try direct path first (fast path)
    try {
      const dirPath = path.join(dir, sessionId);
      const dirStats = await fs.stat(dirPath);
      if (dirStats.isDirectory()) {
        return await this._createDirectorySession(sessionId, dirPath, dirStats);
      }
    } catch {
      // Not a directory
    }

    try {
      const filePath = path.join(dir, `${sessionId}.jsonl`);
      const fileStats = await fs.stat(filePath);
      if (fileStats.isFile()) {
        return await this._createFileSession(`${sessionId}.jsonl`, filePath, fileStats);
      }
    } catch {
      // File not found
    }

    // Recursive search for nested session dirs
    const result = await this._findByIdRecursive(sessionId, dir, 5, 0);
    return result;
  }

  async _findByIdRecursive(sessionId, dir, maxDepth, depth) {
    if (depth > maxDepth) return null;
    let entries;
    try {
      entries = await fs.readdir(dir);
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (shouldSkipEntry(entry)) continue;
      const fullPath = path.join(dir, entry);
      let stats;
      try {
        stats = await fs.stat(fullPath);
      } catch {
        continue;
      }
      if (!stats.isDirectory()) continue;
      if (entry === sessionId) {
        const hasEvents = await fileExists(path.join(fullPath, 'events.jsonl'));
        const hasWorkspace = await fileExists(path.join(fullPath, 'workspace.yaml'));
        if (hasEvents || hasWorkspace) {
          return this._createDirectorySession(entry, fullPath, stats);
        }
      }
      const found = await this._findByIdRecursive(sessionId, fullPath, maxDepth, depth + 1);
      if (found) return found;
    }
    return null;
  }

  async resolveEventsFile(session, dir) {
    // Use session's stored directory path if available (handles nested/recursive dirs)
    if (session.directory) {
      const eventsPath = path.join(session.directory, 'events.jsonl');
      try {
        await fs.access(eventsPath);
        return eventsPath;
      } catch {
        // fall through to dir-based resolution
      }
    }

    const sessionId = session.id || session;
    const sessionPath = path.join(dir, sessionId);
    try {
      const stats = await fs.stat(sessionPath);
      if (stats.isDirectory()) {
        return path.join(sessionPath, 'events.jsonl');
      } else {
        return path.join(dir, `${sessionId}.jsonl`);
      }
    } catch (_err) {
      // For file-based sessions
      if (session.filePath) return session.filePath;
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

  async detectImportCandidate(extractDir) {
    const entries = await fs.readdir(extractDir);
    for (const entry of entries) {
      const entryPath = path.join(extractDir, entry);
      const stat = await fs.stat(entryPath);
      if (stat.isDirectory() && fsSync.existsSync(path.join(entryPath, 'events.jsonl'))) {
        return { matched: true, score: 100, reason: 'Directory with events.jsonl', sessionId: entry, directoryName: entry };
      }
    }
    return { matched: false, score: 0, reason: 'No directory containing events.jsonl found' };
  }

  async importDetectedSession(det, ctx) {
    const { isValidSessionId } = require('../utils/helpers');
    const { sessionId, directoryName } = det;
    if (!isValidSessionId(sessionId)) return { success: false, error: 'Invalid session ID', statusCode: 400 };
    const src = path.join(ctx.extractDir, directoryName);
    if (!fsSync.existsSync(path.join(src, 'events.jsonl'))) return { success: false, error: 'Invalid session structure (no events.jsonl)', statusCode: 400 };
    const targetBase = ctx.targetDir || await this.resolveDir();
    const target = path.join(targetBase, sessionId);
    if (fsSync.existsSync(target)) return { success: false, error: 'Session already exists', statusCode: 409 };
    await fs.mkdir(targetBase, { recursive: true });
    await fs.rename(src, target);
    await fs.writeFile(path.join(target, '.imported'), '');
    return { success: true, sessionId, format: this.type };
  }
}

module.exports = CopilotAdapter;
