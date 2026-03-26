const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const BaseSourceAdapter = require('./BaseSourceAdapter');
const Session = require('../models/Session');
const { countLines, shouldSkipEntry } = require('../utils/fileUtils');
const { ParserFactory } = require('../../lib/parsers');

/**
 * Claude Code Source Adapter
 *
 * Handles sessions stored in ~/.claude/projects/
 * Each project directory contains .jsonl session files and optional
 * subagents-only session directories.
 */
class ClaudeAdapter extends BaseSourceAdapter {
  constructor() {
    super();
    this.parserFactory = new ParserFactory();
  }

  get type() { return 'claude'; }
  get displayName() { return 'Claude'; }
  get envVar() { return 'CLAUDE_SESSION_DIR'; }

  getDefaultDir() {
    return path.join(os.homedir(), '.claude', 'projects');
  }

  async scanEntries(dir) {
    // Top-level entries are project directories
    const entries = await fs.readdir(dir);
    const tasks = entries
      .filter(entry => !shouldSkipEntry(entry))
      .map(async (entry) => {
        const fullPath = path.join(dir, entry);
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          return this._scanProjectDir(fullPath, entry);
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
      const projects = await fs.readdir(dir);

      for (const project of projects) {
        const projectPath = path.join(dir, project);

        // Try main session file first
        const sessionFile = path.join(projectPath, `${sessionId}.jsonl`);
        try {
          const stats = await fs.stat(sessionFile);
          if (stats.isFile()) {
            const session = await this._createClaudeSession(`${sessionId}.jsonl`, sessionFile, stats, project);
            if (session) return session;
          }
        } catch {
          // File not found
        }

        // Try session directory (subagents-only sessions)
        const sessionDir = path.join(projectPath, sessionId);
        try {
          const dirStats = await fs.stat(sessionDir);
          if (dirStats.isDirectory()) {
            const subagentsDir = path.join(sessionDir, 'subagents');
            try {
              const subStats = await fs.stat(subagentsDir);
              if (subStats.isDirectory()) {
                return await this._createSubagentsSession(sessionId, sessionDir, dirStats, project);
              }
            } catch {
              // No subagents directory
            }
          }
        } catch {
          // Directory not found
        }
      }
    } catch {
      // Projects dir not found
    }

    return null;
  }

  async resolveEventsFile(session, dir) {
    if (session.type === 'directory') return null; // Subagents only
    
    try {
      const projects = await fs.readdir(dir);
      for (const project of projects) {
        const candidateFile = path.join(dir, project, `${session.id}.jsonl`);
        try {
          await fs.access(candidateFile);
          return candidateFile;
        } catch {
          // Not here
        }
      }
    } catch (err) {
      console.error('Error searching Claude projects:', err);
    }
    return null;
  }

  async readEvents(session, dir) {
    const eventsFile = await this.resolveEventsFile(session, dir);
    return this.readJsonlEvents(eventsFile);
  }

  async _scanProjectDir(projectDir, projectName) {
    try {
      const entries = await fs.readdir(projectDir);
      const sessions = [];

      for (const entry of entries) {
        if (shouldSkipEntry(entry)) continue;

        const fullPath = path.join(projectDir, entry);
        const stats = await fs.stat(fullPath);

        if (stats.isFile() && entry.endsWith('.jsonl')) {
          const session = await this._createClaudeSession(entry, fullPath, stats, projectName);
          if (session) sessions.push(session);
        }

        if (stats.isDirectory()) {
          const subagentsDir = path.join(fullPath, 'subagents');
          try {
            const subStats = await fs.stat(subagentsDir);
            if (subStats.isDirectory()) {
              const session = await this._createSubagentsSession(entry, fullPath, stats, projectName);
              if (session) sessions.push(session);
            }
          } catch {
            // No subagents directory
          }
        }
      }

      return sessions;
    } catch (err) {
      console.error(`Error scanning Claude project dir ${projectDir}:`, err.message);
      return [];
    }
  }

  async _createClaudeSession(entry, fullPath, stats, projectName) {
    const sessionId = entry.replace('.jsonl', '');
    const eventCount = await countLines(fullPath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      const events = lines.map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(e => e !== null);

      // VALIDATION: Check for Claude core events
      const hasClaudeCoreEvents = events.some(e => e.type === 'assistant' || e.type === 'user');
      const hasCopilotCoreEvents = events.some(e => e.type === 'assistant.message' || e.type === 'user.message');

      if (!hasClaudeCoreEvents && hasCopilotCoreEvents) {
        return null;
      }
      if (!hasClaudeCoreEvents) {
        return null;
      }

      const parserType = this.parserFactory.getParserType(events);
      if (parserType !== 'claude') return null;

      const parsed = this.parserFactory.parse(events);
      const metadata = parsed.metadata || {};
      const projectPath = projectName.replace(/^-/, '/').replace(/-/g, '/');

      return new Session(sessionId, 'file', {
        source: 'claude',
        filePath: fullPath,
        directory: path.dirname(fullPath),
        workspace: {
          summary: metadata.model ? `Claude Code session (${metadata.model})` : 'Claude Code session',
          cwd: metadata.cwd || projectPath
        },
        createdAt: metadata.startTime || stats.birthtime,
        updatedAt: stats.mtime,
        summary: parsed.turns[0]?.userMessage?.content?.substring(0, 100) || 'No summary',
        hasEvents: eventCount > 0,
        eventCount: eventCount,
        duration: null,
        isImported: false,
        hasInsight: false,
        copilotVersion: metadata.version,
        selectedModel: metadata.model,
        sessionStatus: 'completed'
      });
    } catch (err) {
      console.error(`Error creating Claude session ${sessionId}:`, err.message);
      return null;
    }
  }

  async _createSubagentsSession(sessionId, sessionDir, stats, projectName) {
    try {
      const subagentsDir = path.join(sessionDir, 'subagents');
      const files = await fs.readdir(subagentsDir);
      const subagentFiles = files.filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));

      if (subagentFiles.length === 0) return null;

      let totalEvents = 0;
      for (const file of subagentFiles) {
        const filePath = path.join(subagentsDir, file);
        totalEvents += await countLines(filePath);
      }

      const firstFile = path.join(subagentsDir, subagentFiles[0]);
      const content = await fs.readFile(firstFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      const firstEvent = lines.length > 0 ? JSON.parse(lines[0]) : null;

      const metadata = {
        cwd: firstEvent?.cwd || projectName,
        version: firstEvent?.version,
        model: firstEvent?.message?.model,
        startTime: firstEvent?.timestamp
      };

      const projectPath = projectName.replace(/^-/, '/').replace(/-/g, '/');

      return new Session(sessionId, 'directory', {
        source: 'claude',
        directory: sessionDir,
        workspace: {
          summary: `Claude session (${subagentFiles.length} sub-agents)`,
          cwd: metadata.cwd || projectPath
        },
        createdAt: metadata.startTime || stats.birthtime,
        updatedAt: stats.mtime,
        summary: firstEvent?.message?.content?.substring(0, 100) || 'Sub-agent tasks',
        hasEvents: totalEvents > 0,
        eventCount: totalEvents,
        duration: null,
        isImported: false,
        hasInsight: false,
        copilotVersion: metadata.version,
        selectedModel: metadata.model,
        sessionStatus: 'completed'
      });
    } catch (err) {
      console.error(`Error creating Claude subagents session ${sessionId}:`, err.message);
      return null;
    }
  }
}

module.exports = ClaudeAdapter;

