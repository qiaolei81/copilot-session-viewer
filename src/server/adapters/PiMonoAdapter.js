const path = require('path');
const os = require('os');
const fsSync = require('fs');
const fs = fsSync.promises;
const BaseSourceAdapter = require('./BaseSourceAdapter');
const Session = require('../models/Session');
const { countLines, shouldSkipEntry } = require('../utils/fileUtils');
const { readFirstLine } = require('./adapterUtils');

/**
 * Pi-Mono Source Adapter
 *
 * Handles sessions stored in ~/.pi/agent/sessions/
 * Each project directory contains timestamped .jsonl files:
 *   YYYY-MM-DDTHH-mm-ss-SSSZ_<uuid>.jsonl
 */
class PiMonoAdapter extends BaseSourceAdapter {
  get type() { return 'pi-mono'; }
  get displayName() { return 'Pi'; }
  get envVar() { return 'PI_MONO_SESSION_DIR'; }

  getDefaultDir() {
    return path.join(os.homedir(), '.pi', 'agent', 'sessions');
  }

  async scanEntries(dir) {
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
        try {
          const files = await fs.readdir(projectPath);
          const matchingFile = files.find(f => f.includes(`_${sessionId}.jsonl`));
          if (matchingFile) {
            const fullPath = path.join(projectPath, matchingFile);
            const stats = await fs.stat(fullPath);
            return await this._createSession(matchingFile, fullPath, stats, project);
          }
        } catch {
          // Not a directory or can't read
        }
      }
    } catch (err) {
      console.error('Error searching Pi-Mono sessions:', err);
    }

    return null;
  }

  async _createSession(file, fullPath, stats, projectName) {
    const match = file.match(/_([a-f0-9-]+)\.jsonl$/);
    if (!match) return null;

    const sessionId = match[1];
    const firstLine = await readFirstLine(fullPath);
    if (!firstLine) return null;

    try {
      const sessionEvent = JSON.parse(firstLine);
      if (sessionEvent.type !== 'session') return null;

      const eventCount = await countLines(fullPath);
      const mappedProjectPath = projectName.replace(/^--/, '').replace(/--$/, '');

      return new Session(sessionId, 'directory', {
        source: 'pi-mono',
        directory: path.dirname(fullPath),
        workspace: { cwd: sessionEvent.cwd || mappedProjectPath },
        createdAt: new Date(sessionEvent.timestamp),
        updatedAt: new Date(stats.mtime),
        summary: `Pi-Mono: ${path.basename(sessionEvent.cwd || mappedProjectPath)}`,
        hasEvents: eventCount > 0,
        eventCount: eventCount,
        duration: null,
        sessionStatus: 'completed'
      });
    } catch (err) {
      console.error(`[PI-MONO] Error parsing session ${file}:`, err.message);
      return null;
    }
  }

  async resolveEventsFile(session, dir) {
    try {
      const projects = await fs.readdir(dir);
      for (const project of projects) {
        const projectPath = path.join(dir, project);
        try {
          const files = await fs.readdir(projectPath);
          const matchingFile = files.find(f => f.includes(`_${session.id}.jsonl`));
          if (matchingFile) {
            return path.join(projectPath, matchingFile);
          }
        } catch {
          // Not a directory or can't read
        }
      }
    } catch (err) {
      console.error('Error searching Pi-Mono sessions:', err);
    }
    return null;
  }

  async readEvents(session, dir) {
    const eventsFile = await this.resolveEventsFile(session, dir);
    return this.readJsonlEvents(eventsFile);
  }

  async _scanProjectDir(projectPath, projectName) {
    try {
      const entries = await fs.readdir(projectPath);
      const jsonlFiles = entries.filter(e => e.endsWith('.jsonl'));

      if (jsonlFiles.length === 0) return [];

      const sessions = [];
      jsonlFiles.sort().reverse();

      for (const file of jsonlFiles) {
        const fullPath = path.join(projectPath, file);
        const stats = await fs.stat(fullPath);

        const match = file.match(/_([a-f0-9-]+)\.jsonl$/);
        if (!match) continue;

        const sessionId = match[1];

        const firstLine = await readFirstLine(fullPath);
        if (!firstLine) continue;

        try {
          const sessionEvent = JSON.parse(firstLine);
          if (sessionEvent.type !== 'session') continue;

          const eventCount = await countLines(fullPath);
          const mappedProjectPath = projectName.replace(/^--/, '').replace(/--$/, '');

          const session = new Session(sessionId, 'directory', {
            source: 'pi-mono',
            directory: projectPath,
            workspace: { cwd: sessionEvent.cwd || mappedProjectPath },
            createdAt: new Date(sessionEvent.timestamp),
            updatedAt: new Date(stats.mtime),
            summary: `Pi-Mono: ${path.basename(sessionEvent.cwd || mappedProjectPath)}`,
            hasEvents: eventCount > 0,
            eventCount: eventCount,
            duration: null,
            sessionStatus: 'completed'
          });

          sessions.push(session);
        } catch (err) {
          console.error(`[PI-MONO] Error parsing session ${file}:`, err.message);
        }
      }

      return sessions;
    } catch (err) {
      console.error(`[PI-MONO] Error scanning dir ${projectPath}:`, err.message);
      return [];
    }
  }

  async detectImportCandidate(extractDir) {
    const piPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_([a-zA-Z0-9_-]+)\.jsonl$/;
    const entries = await fs.readdir(extractDir);
    for (const entry of entries) {
      const m = entry.match(piPattern);
      if (!m) continue;
      const firstLine = await readFirstLine(path.join(extractDir, entry));
      let parsed; try { parsed = firstLine ? JSON.parse(firstLine) : null; } catch { parsed = null; }
      if (parsed?.type === 'session') {
        return { matched: true, score: 100, reason: 'Pi-Mono timestamped JSONL', sessionId: m[1], fileName: entry };
      }
    }
    return { matched: false, score: 0, reason: 'No Pi-Mono timestamped session JSONL found' };
  }

  async importDetectedSession(det, ctx) {
    const { isValidSessionId } = require('../utils/helpers');
    const { sessionId, fileName } = det;
    if (!isValidSessionId(sessionId)) return { success: false, error: 'Invalid session ID', statusCode: 400 };
    const project = ctx.req.query.project || 'imported-sessions';
    const baseDir = ctx.targetDir || await this.resolveDir();
    const projectPath = path.join(baseDir, project);
    await fs.mkdir(projectPath, { recursive: true });
    await fs.rename(path.join(ctx.extractDir, fileName), path.join(projectPath, fileName));
    return { success: true, sessionId, format: this.type, project };
  }
}

module.exports = PiMonoAdapter;

