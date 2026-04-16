const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { fileURLToPath } = require('url');
const BaseSourceAdapter = require('./BaseSourceAdapter');
const Session = require('../models/Session');
const { shouldSkipEntry } = require('../utils/fileUtils');
const { VsCodeParser } = require('../../lib/parsers');

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
    this._parser = new VsCodeParser();
  }

  get type() { return 'vscode'; }
  get displayName() { return 'Copilot Chat'; }
  get envVar() { return 'VSCODE_WORKSPACE_STORAGE_DIR'; }
  get hasCustomPipeline() { return true; }

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
            const parsedSession = await this._parseSessionFile(fullPath);
            if (!parsedSession) continue;

            const { sessionJson } = parsedSession;
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

  async readEvents(session, _dir) {
    if (!session?.filePath) {
      return [];
    }

    try {
      const parsedSession = await this._parseSessionFile(session.filePath);
      if (!parsedSession) {
        return [];
      }

      let events = this._expandVsCodeEvents(parsedSession.parsed.allEvents);
      events = await this._applyFileMtimeFallback(events, session.filePath);
      return this._expandVsCodeToTimelineFormat(events);
    } catch (err) {
      console.error(`[VSCode readEvents] Error reading session ${session.id}:`, err);
      return [];
    }
  }

  buildTimeline(events, _session) {
    const turns = [];
    let turnId = 0;
    const allSubagentIds = new Set();

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      if (event.type !== 'user.message') {
        continue;
      }

      turnId++;
      const turn = {
        id: `turn-${turnId}`,
        type: 'user-request',
        message: event.data?.message || '',
        startTime: event.timestamp,
        endTime: event.timestamp,
        assistantTurns: [],
        subagents: []
      };

      const turnSubagentIds = new Set();
      let assistantId = 0;
      let j = i + 1;

      while (j < events.length && events[j].type !== 'user.message') {
        const nextEvent = events[j];

        if (nextEvent.type === 'assistant.message') {
          assistantId++;
          turn.endTime = nextEvent.timestamp || turn.endTime;

          const assistantTurn = {
            id: `assistant-${assistantId}`,
            startTime: nextEvent.timestamp,
            endTime: nextEvent.timestamp,
            tools: []
          };

          if (Array.isArray(nextEvent.data?.tools)) {
            for (const tool of nextEvent.data.tools) {
              assistantTurn.tools.push({
                name: tool.name,
                startTime: tool.startTime || nextEvent.timestamp,
                endTime: tool.endTime || nextEvent.timestamp,
                status: tool.status || 'completed',
                input: tool.input,
                result: tool.result
              });
            }
          }

          const subAgentId = nextEvent.data?.subAgentId;
          if (subAgentId && !turnSubagentIds.has(subAgentId)) {
            turnSubagentIds.add(subAgentId);
            allSubagentIds.add(subAgentId);
            turn.subagents.push({
              id: subAgentId,
              name: nextEvent.data?.subAgentName || subAgentId,
              startTime: nextEvent.timestamp,
              endTime: nextEvent.timestamp
            });
          }

          turn.assistantTurns.push(assistantTurn);
        }

        j++;
      }

      turns.push(turn);
    }

    const totalTools = turns.reduce((sum, turn) => (
      sum + turn.assistantTurns.reduce((assistantSum, assistantTurn) => assistantSum + assistantTurn.tools.length, 0)
    ), 0);

    return {
      turns,
      summary: {
        totalTurns: turns.length,
        totalAssistantTurns: turns.reduce((sum, turn) => sum + turn.assistantTurns.length, 0),
        totalTools,
        totalSubagents: allSubagentIds.size,
        startTime: events[0]?.timestamp,
        endTime: events[events.length - 1]?.timestamp
      }
    };
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
        const parsedSession = await this._parseSessionFile(fullPath);
        if (!parsedSession) continue;

        const { sessionJson } = parsedSession;

        const sessionId = sessionJson.sessionId || path.basename(file).replace(/\.jsonl?$/, '');
        const requests = sessionJson.requests || [];
        if (requests.length === 0) continue;

        const statsWithPath = { ...stats, filePath: fullPath };
        const session = this._buildSession(
          sessionId, requests, sessionJson, statsWithPath, workspaceHash,
          realWorkspacePath || workspaceHashDir
        );
        sessions.push(session);
      } catch (err) {
        console.warn(`[VSCode scan] Skipping malformed session file ${fullPath}: ${err.message}`);
      }
    }
    return sessions;
  }

  async _parseSessionFile(filePath) {
    const raw = await fs.readFile(filePath, 'utf-8');
    return this._parseSessionContent(raw, filePath);
  }

  _parseSessionContent(raw, filePath = 'unknown') {
    const trimmedRaw = raw.trim();
    if (!trimmedRaw) {
      return null;
    }

    try {
      const parsedObject = JSON.parse(trimmedRaw);
      if (parsedObject && typeof parsedObject === 'object' && !Array.isArray(parsedObject)) {
        return {
          sessionJson: parsedObject,
          parsed: this._parser.parseVsCode(parsedObject)
        };
      }
    } catch {
      // Not a single JSON object; fall through to JSONL parsing.
    }

    const lines = trimmedRaw.split('\n').filter(line => line.trim());
    const parsedLines = [];

    for (let index = 0; index < lines.length; index++) {
      try {
        parsedLines.push(JSON.parse(lines[index]));
      } catch (err) {
        console.warn(`[VSCode parse] Failed to parse ${filePath} line ${index + 1}: ${err.message}`);
        return null;
      }
    }

    if (parsedLines.length === 0) {
      return null;
    }

    if (this._parser.canParse(parsedLines)) {
      return {
        sessionJson: this._parser.replayMutations(parsedLines),
        parsed: this._parser.parseJsonl(parsedLines)
      };
    }

    if (parsedLines.length === 1 && parsedLines[0] && typeof parsedLines[0] === 'object') {
      return {
        sessionJson: parsedLines[0],
        parsed: this._parser.parseVsCode(parsedLines[0])
      };
    }

    console.warn(`[VSCode parse] Unsupported session format in ${filePath}`);
    return null;
  }

  _parseJsonl(raw, filePath = 'unknown') {
    return this._parseSessionContent(raw, filePath)?.sessionJson || null;
  }

  async _applyFileMtimeFallback(events, filePath) {
    if (!events.length) {
      return events;
    }

    try {
      const stats = await fs.stat(filePath);
      const fileMtime = new Date(stats.mtime).toISOString();
      const lastEvent = events[events.length - 1];

      if (!lastEvent?.timestamp) {
        return events;
      }

      const lastEventTime = new Date(lastEvent.timestamp).getTime();
      const fileTime = new Date(fileMtime).getTime();
      const diffSeconds = (fileTime - lastEventTime) / 1000;

      if (diffSeconds > 10) {
        lastEvent.timestamp = fileMtime;
      }
    } catch (err) {
      console.error('[VSCode] Error getting file mtime:', err);
    }

    return events;
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

    return new Session(sessionId, 'file', {
      source: 'vscode',
      filePath: stats.filePath,
      directory: path.dirname(stats.filePath),
      createdAt,
      updatedAt: effectiveEndTime,
      summary: userText ? userText.slice(0, 120) : `VSCode chat (${requests.length} requests)`,
      hasEvents: true,
      eventCount: requests.reduce((s, r) => s + (r.response || []).length, 0) + requests.length * 2 + 1,
      duration: effectiveEndTime.getTime() - createdAt.getTime(),
      sessionStatus: isWip ? 'wip' : 'completed',
      selectedModel: firstReq.modelId || null,
      copilotVersion: firstReq.agent?.extensionVersion || null,
      workspace: {
        cwd: workspaceCwd,
        workspaceHash
      },
    });
  }

  _expandVsCodeEvents(events) {
    const result = [];
    let pendingTools = [];
    let pendingParentId = null;
    let pendingTs = null;
    let pendingIdx = 0;
    let pendingSubAgentId = null;
    let pendingSubAgentName = null;

    const flushTools = () => {
      if (pendingTools.length === 0) return;
      result.push({
        type: 'assistant.message',
        id: `vscode-tools-${pendingIdx}`,
        timestamp: pendingTs,
        parentId: pendingParentId,
        data: {
          message: '',
          content: '',
          tools: pendingTools,
          subAgentId: pendingSubAgentId,
          subAgentName: pendingSubAgentName
        },
        _synthetic: true
      });
      pendingTools = [];
      pendingSubAgentId = null;
      pendingSubAgentName = null;
    };

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type === 'tool.invocation') {
        const eventSubAgentId = event.data?.subAgentId || null;
        if (pendingTools.length > 0 && eventSubAgentId !== pendingSubAgentId) {
          flushTools();
        }
        if (pendingTools.length === 0) {
          pendingParentId = event.parentId;
          pendingTs = event.timestamp;
          pendingIdx = i;
          pendingSubAgentId = eventSubAgentId;
          pendingSubAgentName = event.data?.subAgentName || null;
        }
        if (event.data?.tool) {
          pendingTools.push(event.data.tool);
        }
        continue;
      }

      flushTools();
      result.push(event);
    }

    flushTools();
    return result;
  }

  _expandVsCodeToTimelineFormat(events) {
    const expanded = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      expanded.push(event);

      if (event.type !== 'assistant.message' || !Array.isArray(event.data?.tools) || event.data.tools.length === 0) {
        continue;
      }

      event.data.tools.forEach((tool, idx) => {
        if (!tool.id || !tool.name) {
          return;
        }

        const toolStartTime = tool.startTime || event.timestamp;
        const toolEndTime = tool.endTime || event.timestamp;

        expanded.push({
          type: 'tool.execution_start',
          id: `${tool.id}-start`,
          timestamp: toolStartTime,
          parentId: event.id,
          data: {
            toolCallId: tool.id,
            toolName: tool.name,
            tool: tool.name,
            arguments: tool.input || {}
          },
          _synthetic: true,
          _fileIndex: event._fileIndex ? event._fileIndex + 0.1 + (idx * 0.02) : undefined
        });

        expanded.push({
          type: 'tool.execution_complete',
          id: `${tool.id}-complete`,
          timestamp: toolEndTime,
          parentId: tool.id,
          data: {
            toolCallId: tool.id,
            toolName: tool.name,
            tool: tool.name,
            result: tool.result || null,
            error: tool.error || (tool.status === 'error' ? 'Tool execution failed' : null),
            isError: tool.status === 'error'
          },
          _synthetic: true,
          _fileIndex: event._fileIndex ? event._fileIndex + 0.15 + (idx * 0.02) : undefined
        });
      });
    }

    return expanded;
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

