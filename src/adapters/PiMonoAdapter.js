const path = require('path');
const os = require('os');
const fs = require('fs').promises;
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

      for (const projectDir of projects) {
        const projectPath = path.join(dir, projectDir);

        try {
          const files = await fs.readdir(projectPath);
          const matchingFile = files.find(f => f.includes(`_${sessionId}.jsonl`));

          if (matchingFile) {
            const filePath = path.join(projectPath, matchingFile);
            const stats = await fs.stat(filePath);

            const firstLine = await readFirstLine(filePath);
            if (firstLine) {
              const sessionEvent = JSON.parse(firstLine);
              if (sessionEvent.type === 'session') {
                const projectName = projectDir.replace(/^--/, '').replace(/--$/, '');
                const eventCount = await countLines(filePath);

                return new Session(sessionId, 'directory', {
                  source: 'pi-mono',
                  filePath: filePath,
                  directory: projectPath,
                  workspace: { cwd: sessionEvent.cwd || projectName },
                  createdAt: new Date(sessionEvent.timestamp),
                  updatedAt: new Date(stats.mtime),
                  summary: `Pi-Mono: ${path.basename(sessionEvent.cwd || projectName)}`,
                  hasEvents: eventCount > 0,
                  eventCount: eventCount,
                  duration: null,
                  sessionStatus: 'completed'
                });
              }
            }
          }
        } catch {
          // Not a directory or can't read
        }
      }
    } catch (err) {
      console.error(`Error searching Pi-Mono sessions: ${err.message}`);
    }

    return null;
  }

  async _scanProjectDir(projectDir, dirName) {
    try {
      const entries = await fs.readdir(projectDir);
      const jsonlFiles = entries.filter(e => e.endsWith('.jsonl'));

      if (jsonlFiles.length === 0) return [];

      const sessions = [];
      jsonlFiles.sort().reverse();

      for (const file of jsonlFiles) {
        const fullPath = path.join(projectDir, file);
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
          const projectPath = dirName.replace(/^--/, '').replace(/--$/, '');

          const session = new Session(sessionId, 'directory', {
            source: 'pi-mono',
            directory: projectDir,
            workspace: { cwd: sessionEvent.cwd || projectPath },
            createdAt: new Date(sessionEvent.timestamp),
            updatedAt: new Date(stats.mtime),
            summary: `Pi-Mono: ${path.basename(sessionEvent.cwd || projectPath)}`,
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
      console.error(`[PI-MONO] Error scanning dir ${projectDir}:`, err.message);
      return [];
    }
  }
}

module.exports = PiMonoAdapter;

