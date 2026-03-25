const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { fileURLToPath } = require('url');
const BaseSourceAdapter = require('./BaseSourceAdapter');
const Session = require('../models/Session');
const { shouldSkipEntry } = require('../utils/fileUtils');

/**
 * Return candidate VS Code workspace storage paths in preference order.
 * Returns [stable, insiders] — stable is always tried first.
 */
function getVSCodeWorkspaceStorageCandidates() {
  let base;
  switch (os.platform()) {
    case 'win32':
      base = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'));
      break;
    case 'darwin':
      base = path.join(os.homedir(), 'Library', 'Application Support');
      break;
    case 'linux':
      base = path.join(os.homedir(), '.config');
      break;
    default:
      base = path.join(os.homedir(), '.config');
  }
  return [
    path.join(base, 'Code', 'User', 'workspaceStorage'),
    path.join(base, 'Code - Insiders', 'User', 'workspaceStorage'),
  ];
}

/**
 * VSCode Copilot Chat Source Adapter
 *
 * Handles sessions stored in VS Code workspaceStorage.
 * Supports both .json (flat) and .jsonl (incremental patch) formats.
 */
class VsCodeAdapter extends BaseSourceAdapter {
  constructor() {
    super();
    this._candidates = null;
  }

  get type() { return 'vscode'; }
  get displayName() { return 'Copilot Chat'; }
  get envVar() { return 'VSCODE_WORKSPACE_STORAGE_DIR'; }

  getDefaultDir() {
    const candidates = this._getCandidates();
    return candidates[0];
  }

  _getCandidates() {
    if (!this._candidates) {
      this._candidates = getVSCodeWorkspaceStorageCandidates();
    }
    return this._candidates;
  }

  /**
   * Override resolveDir to try stable then Insiders.
   */
  async resolveDir() {
    if (this.envVar && process.env[this.envVar]) {
      return process.env[this.envVar];
    }
    const candidates = this._getCandidates();
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch { /* try next */ }
    }
    return null;
  }

  async scanEntries(dir) {
    const entries = await fs.readdir(dir);
    const tasks = entries
      .filter(entry => !shouldSkipEntry(entry))
      .map(async (entry) => {
        const fullPath = path.join(dir, entry);
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          return this._scanWorkspaceDir(fullPath);
        }
        return null;
      });

    const results = await Promise.allSettled(tasks);
    return results
      .filter(r => r.status === 'fulfilled' && r.value !== null && r.value !== undefined)
      .map(r => r.value)
      .flat();
  }

  async findById(sessionId, dir) {
    try {
      const hashes = await fs.readdir(dir);
      const candidates = [];

      for (const hash of hashes) {
        const chatSessionsDir = path.join(dir, hash, 'chatSessions');
        try {
          const files = await fs.readdir(chatSessionsDir);
          const matchingFile = files.find(f => f === `${sessionId}.json` || f === `${sessionId}.jsonl` || f.replace(/\.jsonl?$/, '') === sessionId);
          if (matchingFile) {
            const fullPath = path.join(chatSessionsDir, matchingFile);
            const stats = await fs.stat(fullPath);
            const raw = await fs.readFile(fullPath, 'utf-8');
            let sessionJson;
            if (matchingFile.endsWith('.jsonl')) {
              sessionJson = this._parseJsonl(raw);
              if (!sessionJson) continue;
            } else {
              sessionJson = JSON.parse(raw);
            }
            const requests = sessionJson.requests || [];
            if (requests.length === 0) continue;

            const realWorkspacePath = await this._resolveWorkspacePath(path.join(dir, hash));
            const statsWithPath = { ...stats, filePath: fullPath };
            candidates.push(this._buildSession(
              sessionId, requests, sessionJson, statsWithPath, hash,
              realWorkspacePath || path.join(dir, hash)
            ));
          }
        } catch {
          // No chatSessions dir or can't read
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => (b.updatedAt?.getTime?.() ?? 0) - (a.updatedAt?.getTime?.() ?? 0));
        return candidates[0];
      }
    } catch (err) {
      console.error(`[VSCode findById] Error searching VSCode sessions: ${err.message}`);
    }
    return null;
  }

  // --- Private helpers ---

  async _scanWorkspaceDir(workspaceHashDir) {
    const chatSessionsDir = path.join(workspaceHashDir, 'chatSessions');
    try {
      await fs.access(chatSessionsDir);
    } catch {
      return [];
    }

    const workspaceHash = path.basename(workspaceHashDir);
    const realWorkspacePath = await this._resolveWorkspacePath(workspaceHashDir);

    const entries = await fs.readdir(chatSessionsDir);
    const jsonFiles = entries.filter(e => (e.endsWith('.json') || e.endsWith('.jsonl')) && !shouldSkipEntry(e));
    if (jsonFiles.length === 0) return [];

    const sessions = [];
    for (const file of jsonFiles) {
      const fullPath = path.join(chatSessionsDir, file);
      try {
        const stats = await fs.stat(fullPath);
        const raw = await fs.readFile(fullPath, 'utf-8');
        let sessionJson;
        if (file.endsWith('.jsonl')) {
          sessionJson = this._parseJsonl(raw);
          if (!sessionJson) continue;
        } else {
          sessionJson = JSON.parse(raw);
        }

        const sessionId = sessionJson.sessionId || path.basename(file).replace(/\.jsonl?$/, '');
        const requests = sessionJson.requests || [];
        if (requests.length === 0) continue;

        const statsWithPath = { ...stats, filePath: fullPath };
        const session = this._buildSession(
          sessionId, requests, sessionJson, statsWithPath, workspaceHash,
          realWorkspacePath || workspaceHashDir
        );
        sessions.push(session);
      } catch {
        // Skip malformed files silently
      }
    }
    return sessions;
  }

  _parseJsonl(raw) {
    const lines = raw.split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;

    const first = JSON.parse(lines[0]);
    const sessionJson = first.v || first;

    for (let idx = 1; idx < lines.length; idx++) {
      try {
        const patch = JSON.parse(lines[idx]);
        const k = patch.k || [];
        const v = patch.v;

        if (patch.kind === 2 && Array.isArray(v)) {
          let obj = sessionJson;
          for (let ki = 0; ki < k.length - 1; ki++) {
            const key = k[ki];
            if (typeof key === 'number') {
              obj = obj[key];
            } else {
              if (!obj[key]) obj[key] = {};
              obj = obj[key];
            }
          }
          const lastKey = k[k.length - 1];
          if (lastKey !== undefined) {
            if (!obj[lastKey]) obj[lastKey] = [];
            const target = obj[lastKey];
            const i = patch.i;
            if (i === null || i === undefined) {
              target.push(...v);
            } else {
              target.splice(i, 0, ...v);
            }
          } else {
            const i = patch.i;
            if (i === null || i === undefined) sessionJson.push?.(...v);
          }
        } else if (patch.kind === 1 && k.length > 0) {
          let obj = sessionJson;
          for (let ki = 0; ki < k.length - 1; ki++) {
            const key = k[ki];
            if (typeof key === 'number') {
              obj = obj[key];
            } else {
              if (!obj[key]) obj[key] = {};
              obj = obj[key];
            }
          }
          const lastKey = k[k.length - 1];
          obj[lastKey] = v;
        }
      } catch {
        // Skip malformed lines
      }
    }

    return sessionJson;
  }

  async _resolveWorkspacePath(workspaceHashDir) {
    try {
      const workspaceJsonPath = path.join(workspaceHashDir, 'workspace.json');
      const raw = await fs.readFile(workspaceJsonPath, 'utf-8');
      const meta = JSON.parse(raw);

      if (meta.folder) {
        return fileURLToPath(meta.folder);
      }

      if (meta.workspace) {
        const wsFilePath = fileURLToPath(meta.workspace);
        try {
          const wsRaw = await fs.readFile(wsFilePath, 'utf-8');
          const ws = JSON.parse(wsRaw);
          if (Array.isArray(ws.folders) && ws.folders.length > 0) {
            const wsDir = path.dirname(wsFilePath);
            return path.resolve(wsDir, ws.folders[0].path);
          }
        } catch {
          // Ignore nested read errors
        }
      }
    } catch {
      // No workspace.json or unreadable
    }
    return null;
  }

  _buildSession(sessionId, requests, sessionJson, stats, workspaceHash, workspaceCwd) {
    const firstReq = requests[0];
    const lastReq = requests[requests.length - 1];

    const createdAt = sessionJson.creationDate
      ? new Date(sessionJson.creationDate)
      : (firstReq.timestamp ? new Date(firstReq.timestamp) : stats.birthtime);

    const lastReqTime = lastReq.timestamp ? new Date(lastReq.timestamp) : null;
    const fallbackUpdatedAt = sessionJson.lastMessageDate
      ? new Date(sessionJson.lastMessageDate)
      : (lastReqTime || stats.mtime);

    const lastTerminalTime = this._extractLastTerminalTimestamp(requests);
    const effectiveEndTime = lastTerminalTime || lastReqTime || fallbackUpdatedAt;

    const isWip = (Date.now() - effectiveEndTime.getTime()) < 15 * 60 * 1000;
    const userText = this._extractUserText(firstReq.message);
    const toolCount = requests.reduce(
      (sum, req) => sum + (req.response || []).filter(r => r.kind === 'toolInvocationSerialized').length,
      0
    );

    return new Session(sessionId, 'file', {
      source: 'vscode',
      filePath: stats.filePath,
      workspaceHash,
      createdAt,
      updatedAt: effectiveEndTime,
      summary: userText ? userText.slice(0, 120) : `VSCode chat (${requests.length} requests)`,
      hasEvents: true,
      eventCount: requests.reduce((s, r) => s + (r.response || []).length, 0) + requests.length * 2 + 1,
      duration: effectiveEndTime.getTime() - createdAt.getTime(),
      sessionStatus: isWip ? 'wip' : 'completed',
      selectedModel: firstReq.modelId || null,
      agentId: firstReq.agent?.id || 'vscode-copilot',
      toolCount,
      copilotVersion: firstReq.agent?.extensionVersion || null,
      workspace: { cwd: workspaceCwd },
    });
  }

  _extractLastTerminalTimestamp(requests) {
    let maxTs = 0;

    function walk(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      if (obj.terminalCommandState && typeof obj.terminalCommandState.timestamp === 'number') {
        const ts = obj.terminalCommandState.timestamp;
        if (ts > 1_000_000_000_000 && ts < 9_999_999_999_999 && ts > maxTs) maxTs = ts;
      }
      for (const val of Object.values(obj)) walk(val);
    }

    for (const req of requests) walk(req.response);
    return maxTs > 0 ? new Date(maxTs) : null;
  }

  _extractUserText(message) {
    if (!message) return '';
    if (typeof message.text === 'string') return message.text;
    if (Array.isArray(message.parts)) {
      return message.parts.filter(p => p.kind === 'text').map(p => p.text || '').join('');
    }
    return '';
  }
}

module.exports = VsCodeAdapter;

