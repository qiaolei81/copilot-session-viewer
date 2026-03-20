const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { fileURLToPath } = require('url');
const Session = require('../models/Session');
const { fileExists, countLines, parseYAML, getSessionMetadataOptimized, shouldSkipEntry } = require('../utils/fileUtils');
const { ParserFactory } = require('../../lib/parsers');

/**
 * Return candidate VS Code workspace storage paths in preference order.
 * The caller resolves which one exists at scan time (async).
 * Returns [stable, insiders] — stable is always tried first.
 */
function getVSCodeWorkspaceStorageCandidates() {
  // VS Code's user data dir can be overridden via --user-data-dir CLI flag,
  // but that's not detectable here. Use VSCODE_WORKSPACE_STORAGE_DIR env var
  // for custom setups (Insiders, portable mode, --user-data-dir installs).
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
      // Unknown platform (e.g. FreeBSD): fall back to XDG-style ~/.config
      base = path.join(os.homedir(), '.config');
  }
  return [
    path.join(base, 'Code', 'User', 'workspaceStorage'),
    path.join(base, 'Code - Insiders', 'User', 'workspaceStorage'),
  ];
}

/**
 * Session Repository - Data access layer for sessions
 * Supports both Copilot CLI and Claude Code sessions
 */
class SessionRepository {
  constructor(sessionDirs) {
    // Support both old (single dir) and new (multi-source) initialization
    if (typeof sessionDirs === 'string') {
      this.sources = [{
        type: 'copilot',
        dir: sessionDirs
      }];
    } else if (Array.isArray(sessionDirs)) {
      this.sources = sessionDirs;
    } else {
      // Default: Copilot + Claude + Pi-Mono + VSCode
      // Support environment variables for each source (useful for testing/CI)
      this.sources = [
        {
          type: 'copilot',
          dir: process.env.COPILOT_SESSION_DIR ||
               process.env.SESSION_DIR || // Legacy fallback
               path.join(os.homedir(), '.copilot', 'session-state')
        },
        {
          type: 'claude',
          dir: process.env.CLAUDE_SESSION_DIR ||
               path.join(os.homedir(), '.claude', 'projects')
        },
        {
          type: 'pi-mono',
          dir: process.env.PI_MONO_SESSION_DIR ||
               path.join(os.homedir(), '.pi', 'agent', 'sessions')
        },
        {
          type: 'vscode',
          // dir defaults to the stable candidate so findById always has a non-null value.
          // dirCandidates lets _scanSource fall back to Insiders at scan time (async).
          ...(process.env.VSCODE_WORKSPACE_STORAGE_DIR
            ? { dir: process.env.VSCODE_WORKSPACE_STORAGE_DIR }
            : (() => { const c = getVSCodeWorkspaceStorageCandidates(); return { dir: c[0], dirCandidates: c }; })()
          ),
        }
      ];
    }
    
    this.parserFactory = new ParserFactory();
    
    // Cache: keyed by sourceType (null = all sources)
    this._cache = new Map();
    this._cacheTTL = 60 * 1000; // 60 seconds
    this._pendingScans = new Map(); // dedup concurrent requests
  }

  /**
   * Invalidate cache (call after tag/insight changes if needed)
   */
  invalidateCache(sourceType = null) {
    if (sourceType) {
      this._cache.delete(sourceType);
      this._cache.delete(null); // also invalidate "all" cache
    } else {
      this._cache.clear();
    }
  }

  /**
   * Get all sessions from all sources (or a specific source)
   * @param {string|null} sourceType - Optional source type filter ('copilot', 'claude', 'pi-mono', 'vscode')
   * @returns {Promise<Session[]>} Array of sessions sorted by updatedAt (newest first)
   */
  async findAll(sourceType = null) {
    const cacheKey = sourceType || '__all__';
    
    // Check cache
    const cached = this._cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this._cacheTTL)) {
      return cached.data;
    }

    // Dedup concurrent scans for same key
    if (this._pendingScans.has(cacheKey)) {
      return this._pendingScans.get(cacheKey);
    }

    const scanPromise = this._doFindAll(sourceType).then(result => {
      this._cache.set(cacheKey, { data: result, timestamp: Date.now() });
      this._pendingScans.delete(cacheKey);
      return result;
    }).catch(err => {
      this._pendingScans.delete(cacheKey);
      throw err;
    });

    this._pendingScans.set(cacheKey, scanPromise);
    return scanPromise;
  }

  /**
   * @private
   */
  async _doFindAll(sourceType = null) {
    const allSessions = [];

    const sources = sourceType
      ? this.sources.filter(s => s.type === sourceType)
      : this.sources;

    for (const source of sources) {
      try {
        const sessions = await this._scanSource(source);
        allSessions.push(...sessions);
      } catch (err) {
        console.error(`Error reading ${source.type} sessions from ${source.dir}:`, err.message);
      }
    }

    return this._sortByUpdatedAt(this._deduplicateSessions(allSessions));
  }

  /**
   * Deduplicate sessions with the same ID (e.g. VSCode sessions in multiple workspaces).
   * Keeps the most recently updated session for each ID.
   * @private
   */
  _deduplicateSessions(sessions) {
    const seen = new Map();
    for (const session of sessions) {
      const existing = seen.get(session.id);
      if (!existing || (session.updatedAt && existing.updatedAt && new Date(session.updatedAt) > new Date(existing.updatedAt))) {
        seen.set(session.id, session);
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Scan a single source directory
   * @private
   */
  /**
   * Resolve the active directory for a source that has multiple candidates
   * (e.g. VS Code stable vs Insiders). The resolved dir is cached on the
   * source object to avoid repeated fs.access calls on subsequent scans.
   * Returns null when no candidate is accessible.
   * @private
   */
  async _resolveSourceDir(source) {
    if (!source.dirCandidates) return source.dir;
    for (const candidate of source.dirCandidates) {
      try {
        await fs.access(candidate);
        source.dir = candidate; // cache for future calls
        return candidate;
      } catch { /* try next */ }
    }
    return null;
  }

  async _scanSource(source) {
    // For sources with multiple candidates (e.g. VS Code stable vs Insiders),
    // resolve the first accessible one.
    if (source.dirCandidates) {
      const resolved = await this._resolveSourceDir(source);
      if (!resolved) {
        console.warn(`No ${source.type} directory found (tried: ${source.dirCandidates.join(', ')})`);
        return [];
      }
    }

    try {
      await fs.access(source.dir);
    } catch {
      console.warn(`Source directory not found: ${source.dir}`);
      return [];
    }

    const entries = await fs.readdir(source.dir);
    const tasks = entries
      .filter(entry => !shouldSkipEntry(entry))
      .map(async (entry) => {
        const fullPath = path.join(source.dir, entry);
        const stats = await fs.stat(fullPath);

        if (source.type === 'copilot') {
          // Copilot: directory-based or .jsonl files
          if (stats.isDirectory()) {
            return this._createDirectorySession(entry, fullPath, stats, 'copilot');
          } else if (entry.endsWith('.jsonl')) {
            return this._createFileSession(entry, fullPath, stats, 'copilot');
          }
        } else if (source.type === 'claude') {
          // Claude: all directories contain .jsonl files named by sessionId
          if (stats.isDirectory()) {
            return this._scanClaudeProjectDir(fullPath, entry);
          }
        } else if (source.type === 'pi-mono') {
          // Pi-Mono: project directories containing timestamped .jsonl files
          if (stats.isDirectory()) {
            return this._scanPiMonoDir(fullPath, entry);
          }
        } else if (source.type === 'vscode') {
          // VSCode: workspace hash directories containing chatSessions/*.jsonl
          if (stats.isDirectory()) {
            return this._scanVsCodeWorkspaceDir(fullPath);
          }
        }
        return null;
      });

    const results = await Promise.allSettled(tasks);
    return results
      .filter(r => r.status === 'fulfilled' && r.value !== null && r.value !== undefined)
      .map(r => r.value)
      .flat(); // flat() because scanClaudeProjectDir returns array
  }

  /**
   * Scan Claude project directory (contains multiple session .jsonl files AND directories with subagents)
   * @private
   */
  async _scanClaudeProjectDir(projectDir, projectName) {
    try {
      const entries = await fs.readdir(projectDir);
      const sessions = [];

      for (const entry of entries) {
        if (shouldSkipEntry(entry)) continue;

        const fullPath = path.join(projectDir, entry);
        const stats = await fs.stat(fullPath);
        
        // Handle .jsonl files (main session files)
        if (stats.isFile() && entry.endsWith('.jsonl')) {
          const session = await this._createClaudeSession(entry, fullPath, stats, projectName);
          if (session) {
            sessions.push(session);
          }
        }
        
        // Handle directories (potential subagents-only sessions)
        if (stats.isDirectory()) {
          // Check if this directory has a subagents subdirectory
          const subagentsDir = path.join(fullPath, 'subagents');
          try {
            const subStats = await fs.stat(subagentsDir);
            if (subStats.isDirectory()) {
              // This is a valid subagents-only session
              const session = await this._createClaudeSubagentsSession(entry, fullPath, stats, projectName);
              if (session) {
                sessions.push(session);
              }
            }
          } catch {
            // No subagents directory, not a session directory
          }
        }
      }

      return sessions;
    } catch (err) {
      console.error(`Error scanning Claude project dir ${projectDir}:`, err.message);
      return [];
    }
  }

  /**
   * Create Claude Code session from .jsonl file
   * @private
   */
  async _createClaudeSession(entry, fullPath, stats, projectName) {
    const sessionId = entry.replace('.jsonl', '');
    const eventCount = await countLines(fullPath);

    console.log(`[DEBUG] _createClaudeSession: ${entry}, events: ${eventCount}`);

    // Read events to extract metadata and VALIDATE format
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      const events = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(e => e !== null);

      console.log(`[DEBUG] Parsed ${events.length} events from ${entry}`);

      // VALIDATION: Check if this has Claude CORE events (assistant, user)
      // Ignore metadata events like file-history-snapshot, progress (可以共存)
      const hasClaudeCoreEvents = events.some(e => e.type === 'assistant' || e.type === 'user');
      const hasCopilotCoreEvents = events.some(e => e.type === 'assistant.message' || e.type === 'user.message');
      
      console.log(`[DEBUG] ${entry}: hasClaudeCoreEvents=${hasClaudeCoreEvents}, hasCopilotCoreEvents=${hasCopilotCoreEvents}`);
      
      if (!hasClaudeCoreEvents && hasCopilotCoreEvents) {
        console.warn(`File ${fullPath} contains only Copilot core events, skipping as Claude session`);
        return null;
      }
      
      // If no Claude core events, also skip (empty or invalid file)
      if (!hasClaudeCoreEvents) {
        console.warn(`File ${fullPath} has no Claude core events (assistant/user), skipping`);
        return null;
      }

      console.log(`[DEBUG] ${entry} passed validation, creating session...`);

      // Use parser to extract metadata
      const parserType = this.parserFactory.getParserType(events);
      if (parserType !== 'claude') {
        // Not a valid Claude session
        return null;
      }

      const parsed = this.parserFactory.parse(events);
      const metadata = parsed.metadata || {};

      // Extract project name from directory name (convert back from dashes to slashes)
      const projectPath = projectName.replace(/^-/, '/').replace(/-/g, '/');

      return new Session(sessionId, 'file', {
        source: 'claude',
        filePath: fullPath,
        directory: path.dirname(fullPath), // Directory containing the session file
        workspace: {
          summary: metadata.model ? `Claude Code session (${metadata.model})` : 'Claude Code session',
          cwd: metadata.cwd || projectPath
        },
        createdAt: metadata.startTime || stats.birthtime,
        updatedAt: stats.mtime,
        summary: parsed.turns[0]?.userMessage?.content?.substring(0, 100) || 'No summary',
        hasEvents: eventCount > 0,
        eventCount: eventCount,
        duration: null, // Claude format doesn't have explicit duration
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

  /**
   * Find session by ID (searches all sources)
   * @param {string} sessionId - Session ID
   * @returns {Promise<Session|null>}
   */
  async findById(sessionId) {
    if (shouldSkipEntry(sessionId)) return null;

    for (const source of this.sources) {
      let session = null;

      if (source.type === 'copilot') {
        session = await this._findCopilotSession(sessionId, source.dir);
      } else if (source.type === 'claude') {
        session = await this._findClaudeSession(sessionId, source.dir);
      } else if (source.type === 'pi-mono') {
        session = await this._findPiMonoSession(sessionId, source.dir);
      } else if (source.type === 'vscode') {
        const dir = source.dirCandidates
          ? await this._resolveSourceDir(source)
          : source.dir;
        if (dir) session = await this._findVsCodeSession(sessionId, dir);
      }

      if (session) return session;
    }

    return null;
  }

  /**
   * Find Copilot session by ID
   * @private
   */
  async _findCopilotSession(sessionId, sessionDir) {
    // Try directory first
    try {
      const dirPath = path.join(sessionDir, sessionId);
      const dirStats = await fs.stat(dirPath);
      if (dirStats.isDirectory()) {
        return await this._createDirectorySession(sessionId, dirPath, dirStats, 'copilot');
      }
    } catch {
      // Not a directory
    }

    // Try .jsonl file
    try {
      const filePath = path.join(sessionDir, `${sessionId}.jsonl`);
      const fileStats = await fs.stat(filePath);
      if (fileStats.isFile()) {
        return await this._createFileSession(`${sessionId}.jsonl`, filePath, fileStats, 'copilot');
      }
    } catch {
      // File not found
    }

    return null;
  }

  /**
   * Find Claude session by ID (searches all project directories)
   * @private
   */
  async _findClaudeSession(sessionId, projectsDir) {
    try {
      const projects = await fs.readdir(projectsDir);
      
      for (const project of projects) {
        const projectPath = path.join(projectsDir, project);
        
        // Try main session file first
        const sessionFile = path.join(projectPath, `${sessionId}.jsonl`);
        try {
          const stats = await fs.stat(sessionFile);
          if (stats.isFile()) {
            console.log(`[DEBUG] Found file: ${sessionFile}`);
            const session = await this._createClaudeSession(`${sessionId}.jsonl`, sessionFile, stats, project);
            // If file contains Copilot events (validation failed), continue to check directory
            if (session) {
              console.log('[DEBUG] File validated as Claude session, returning');
              return session;
            }
            console.log('[DEBUG] File validation failed, checking directory...');
            // Otherwise fall through to check directory
          }
        } catch (err) {
          // Main file not found, try directory
          console.log(`[DEBUG] File not found: ${sessionFile}, error: ${err.message}`);
        }
        
        // Try session directory (subagents-only sessions, or when file validation failed)
        const sessionDir = path.join(projectPath, sessionId);
        console.log(`[DEBUG] Checking directory: ${sessionDir}`);
        try {
          const dirStats = await fs.stat(sessionDir);
          if (dirStats.isDirectory()) {
            console.log('[DEBUG] Directory exists, checking for subagents...');
            // Check if it has subagents subdirectory
            const subagentsDir = path.join(sessionDir, 'subagents');
            try {
              const subStats = await fs.stat(subagentsDir);
              if (subStats.isDirectory()) {
                console.log('[DEBUG] Found subagents directory, creating session...');
                // Valid Claude subagents-only session
                const result = await this._createClaudeSubagentsSession(sessionId, sessionDir, dirStats, project);
                console.log('[DEBUG] Created subagents session:', result ? 'SUCCESS' : 'FAILED');
                return result;
              }
            } catch (err) {
              // No subagents directory
              console.log(`[DEBUG] No subagents directory: ${err.message}`);
            }
          }
        } catch (err) {
          // Directory not found, continue
          console.log(`[DEBUG] Directory not found: ${err.message}`);
        }
      }
    } catch (err) {
      // Projects dir not found
      console.error(`[DEBUG] Projects dir error: ${err.message}`);
    }

    console.log(`[DEBUG] Session ${sessionId} not found in any project`);
    return null;
  }

  /**
   * Find Pi-Mono session by ID (searches all project directories)
   * @private
   */
  async _findPiMonoSession(sessionId, sessionsDir) {
    try {
      const projects = await fs.readdir(sessionsDir);
      
      for (const projectDir of projects) {
        const projectPath = path.join(sessionsDir, projectDir);
        
        try {
          const files = await fs.readdir(projectPath);
          // Look for file matching pattern: *_<sessionId>.jsonl
          const matchingFile = files.find(f => f.includes(`_${sessionId}.jsonl`));
          
          if (matchingFile) {
            const filePath = path.join(projectPath, matchingFile);
            const stats = await fs.stat(filePath);
            
            // Read first line for metadata
            const firstLine = await this._readFirstLine(filePath);
            if (firstLine) {
              const sessionEvent = JSON.parse(firstLine);
              if (sessionEvent.type === 'session') {
                const projectName = projectDir.replace(/^--/, '').replace(/--$/, '');
                const eventCount = await countLines(filePath);
                
                return new Session(
                  sessionId,
                  'directory',
                  {
                    source: 'pi-mono',
                    filePath: filePath,
                    directory: projectPath, // Project directory containing the session file
                    workspace: { cwd: sessionEvent.cwd || projectName },
                    createdAt: new Date(sessionEvent.timestamp),
                    updatedAt: new Date(stats.mtime),
                    summary: `Pi-Mono: ${path.basename(sessionEvent.cwd || projectName)}`,
                    hasEvents: eventCount > 0,
                    eventCount: eventCount,
                    duration: null,
                    sessionStatus: 'completed'
                  }
                );
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

  /**
   * Find VSCode session by ID in workspaceStorage
   * @private
   */
  async _findVsCodeSession(sessionId, workspaceStorageDir) {
    try {
      const hashes = await fs.readdir(workspaceStorageDir);
      const candidates = [];

      for (const hash of hashes) {
        const chatSessionsDir = path.join(workspaceStorageDir, hash, 'chatSessions');
        try {
          const files = await fs.readdir(chatSessionsDir);
          const matchingFile = files.find(f => f === `${sessionId}.json` || f === `${sessionId}.jsonl` || f.replace(/\.jsonl?$/, '') === sessionId);
          if (matchingFile) {
            const fullPath = path.join(chatSessionsDir, matchingFile);
            const stats = await fs.stat(fullPath);
            const raw = await fs.readFile(fullPath, 'utf-8');
            let sessionJson;
            if (matchingFile.endsWith('.jsonl')) {
              sessionJson = this._parseVsCodeJsonl(raw);
              if (!sessionJson) continue;
            } else {
              sessionJson = JSON.parse(raw);
            }
            const requests = sessionJson.requests || [];
            if (requests.length === 0) continue;

            const realWorkspacePath = await this._resolveVsCodeWorkspacePath(path.join(workspaceStorageDir, hash));
            const statsWithPath = { ...stats, filePath: fullPath };
            candidates.push(this._buildVsCodeSession(
              sessionId, requests, sessionJson, statsWithPath, hash,
              realWorkspacePath || path.join(workspaceStorageDir, hash)
            ));
          }
        } catch {
          // No chatSessions dir or can't read — skip
        }
      }
      // Return the candidate with the latest effectiveEndTime (most complete data)
      if (candidates.length > 0) {
        candidates.sort((a, b) => (b.updatedAt?.getTime?.() ?? 0) - (a.updatedAt?.getTime?.() ?? 0));
        return candidates[0];
      }
    } catch (err) {
      console.error(`[VSCode findById] Error searching VSCode sessions: ${err.message}`, err.stack);
    }
    console.log(`[VSCode findById] Session ${sessionId} not found in vscode sessions`);
    return null;
  }

  /**
   * Create Claude session from subagents-only directory (no main events.jsonl)
   * @private
   */
  async _createClaudeSubagentsSession(sessionId, sessionDir, stats, projectName) {
    try {
      const subagentsDir = path.join(sessionDir, 'subagents');
      const files = await fs.readdir(subagentsDir);
      const subagentFiles = files.filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));
      
      if (subagentFiles.length === 0) {
        return null;
      }
      
      // Count events from all subagent files
      let totalEvents = 0;
      for (const file of subagentFiles) {
        const filePath = path.join(subagentsDir, file);
        totalEvents += await countLines(filePath);
      }
      
      // Read first subagent file for metadata
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
        directory: sessionDir, // Session directory path
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

  /**
   * Create session from directory (Copilot format)
   * @private
   */
  async _createDirectorySession(entry, fullPath, stats, source = 'copilot') {
    const workspaceFile = path.join(fullPath, 'workspace.yaml');
    const eventsFile = path.join(fullPath, 'events.jsonl');
    const importedMarkerFile = path.join(fullPath, '.imported');
    const insightReportFile = path.join(fullPath, `${entry}.agent-review.md`);

    // Parse workspace.yaml if exists, otherwise use defaults
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

    // Use optimized metadata extraction if events file exists
    if (await fileExists(eventsFile)) {
      const optimizedMetadata = await getSessionMetadataOptimized(eventsFile);
      duration = optimizedMetadata.duration;
      copilotVersion = optimizedMetadata.copilotVersion;
      selectedModel = optimizedMetadata.selectedModel;

      sessionStatus = this._computeSessionStatus(optimizedMetadata);

      if (!workspace.summary && optimizedMetadata.firstUserMessage) {
        workspace.summary = optimizedMetadata.firstUserMessage;
      }

      // Use max of filesystem mtime and last event timestamp for updatedAt
      if (optimizedMetadata.lastEventTime) {
        const lastEventMs = new Date(optimizedMetadata.lastEventTime).getTime();
        const mtimeMs = new Date(stats.mtime).getTime();
        if (lastEventMs > mtimeMs) {
          stats = { ...stats, mtime: new Date(lastEventMs) };
        }
      }
    }

    const session = Session.fromDirectory(fullPath, entry, stats, workspace, eventCount, duration, isImported, hasInsight, copilotVersion, selectedModel, sessionStatus);
    session.source = source;
    return session;
  }

  /**
   * Create session from .jsonl file (Copilot format)
   * @private
   */
  async _createFileSession(entry, fullPath, stats, source = 'copilot') {
    const sessionId = entry.replace('.jsonl', '');
    const eventCount = await countLines(fullPath);

    const optimizedMetadata = await getSessionMetadataOptimized(fullPath);
    const sessionStatus = this._computeSessionStatus(optimizedMetadata);

    const session = Session.fromFile(
      fullPath,
      sessionId,
      stats,
      eventCount,
      optimizedMetadata.firstUserMessage,
      optimizedMetadata.duration,
      optimizedMetadata.copilotVersion,
      optimizedMetadata.selectedModel,
      sessionStatus
    );
    session.source = source;
    return session;
  }

  /**
   * Compute session status from metadata
   * @private
   */
  _computeSessionStatus(metadata) {
    if (metadata.hasSessionEnd) {
      return 'completed';
    }
    if (metadata.lastEventTime !== null && metadata.lastEventTime !== undefined) {
      const WIP_THRESHOLD_MS = 5 * 60 * 1000;
      if ((Date.now() - metadata.lastEventTime) < WIP_THRESHOLD_MS) {
        return 'wip';
      }
    }
    return 'completed';
  }

  /**
   * Scan Pi-Mono project directory (--project-path--)
   * Contains timestamped .jsonl files: YYYY-MM-DDTHH-mm-ss-SSSZ_<uuid>.jsonl
   * @private
   */
  async _scanPiMonoDir(projectDir, dirName) {
    try {
      console.log(`[PI-MONO] Scanning directory: ${projectDir}`);
      const entries = await fs.readdir(projectDir);
      const jsonlFiles = entries.filter(e => e.endsWith('.jsonl'));

      console.log(`[PI-MONO] Found ${jsonlFiles.length} .jsonl files in ${dirName}`);
      
      if (jsonlFiles.length === 0) {
        return [];
      }

      const sessions = [];

      // Sort files by name (timestamp) to get latest
      jsonlFiles.sort().reverse();

      for (const file of jsonlFiles) {
        const fullPath = path.join(projectDir, file);
        const stats = await fs.stat(fullPath);

        // Extract session ID from filename: YYYY-MM-DD...Z_<uuid>.jsonl
        const match = file.match(/_([a-f0-9-]+)\.jsonl$/);
        if (!match) {
          console.log(`[PI-MONO] Skipping ${file}: no UUID match`);
          continue;
        }

        const sessionId = match[1];

        // Read first line to get session metadata
        const firstLine = await this._readFirstLine(fullPath);
        if (!firstLine) {
          console.log(`[PI-MONO] Skipping ${file}: no first line`);
          continue;
        }

        try {
          const sessionEvent = JSON.parse(firstLine);
          if (sessionEvent.type !== 'session') {
            console.log(`[PI-MONO] Skipping ${file}: first event type is ${sessionEvent.type}, not 'session'`);
            continue;
          }

          // Count events in the file
          const eventCount = await countLines(fullPath);

          // Extract project name from directory (remove -- prefix/suffix)
          const projectPath = dirName.replace(/^--/, '').replace(/--$/, '');

          const session = new Session(
            sessionId,
            'directory',
            {
              source: 'pi-mono',
              directory: projectDir, // Add directory path for Agent Review
              workspace: { cwd: sessionEvent.cwd || projectPath },
              createdAt: new Date(sessionEvent.timestamp),
              updatedAt: new Date(stats.mtime),
              summary: `Pi-Mono: ${path.basename(sessionEvent.cwd || projectPath)}`,
              hasEvents: eventCount > 0,
              eventCount: eventCount,
              duration: null,
              sessionStatus: 'completed'
            }
          );

          console.log(`[PI-MONO] Created session: ${sessionId} from ${file}`);
          sessions.push(session);
        } catch (err) {
          console.error(`[PI-MONO] Error parsing session ${file}:`, err.message);
        }
      }

      console.log(`[PI-MONO] Total sessions found in ${dirName}: ${sessions.length}`);
      return sessions;
    } catch (err) {
      console.error(`[PI-MONO] Error scanning dir ${projectDir}:`, err.message);
      return [];
    }
  }

  /**
   * Scan a VSCode workspaceStorage/<hash> directory for chatSessions/*.json files
   * @private
   */
  /** Resolve the real project/workspace path from a VSCode workspaceStorage hash directory */
  /** Parse a VSCode .jsonl file: read kind=0 for base state, merge kind=2 patches into response arrays */
  _parseVsCodeJsonl(raw) {
    const lines = raw.split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;

    const first = JSON.parse(lines[0]);
    const sessionJson = first.v || first; // kind=0 wraps in .v

    // Apply kind=1 (field set) and kind=2 (array splice) patches
    for (let idx = 1; idx < lines.length; idx++) {
      try {
        const patch = JSON.parse(lines[idx]);
        const k = patch.k || [];
        const v = patch.v;

        if (patch.kind === 2 && Array.isArray(v)) {
          // Navigate to parent object, then splice into the target array
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
            // k is empty — splice into sessionJson itself (rare)
            const i = patch.i;
            if (i === null || i === undefined) sessionJson.push?.(...v);
          }
        } else if (patch.kind === 1 && k.length > 0) {
          // Navigate to parent, set the final key
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

  async _resolveVsCodeWorkspacePath(workspaceHashDir) {
    try {
      const workspaceJsonPath = path.join(workspaceHashDir, 'workspace.json');
      const raw = await fs.readFile(workspaceJsonPath, 'utf-8');
      const meta = JSON.parse(raw);

      if (meta.folder) {
        // Single-folder workspace: file:///path/to/project
        return fileURLToPath(meta.folder);
      }

      if (meta.workspace) {
        // Multi-folder workspace: points to another .json with folders array
        const wsFilePath = fileURLToPath(meta.workspace);
        try {
          const wsRaw = await fs.readFile(wsFilePath, 'utf-8');
          const ws = JSON.parse(wsRaw);
          if (Array.isArray(ws.folders) && ws.folders.length > 0) {
            // Return first folder path
            const wsDir = path.dirname(wsFilePath);
            const resolved = path.resolve(wsDir, ws.folders[0].path);
            return resolved;
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

  async _scanVsCodeWorkspaceDir(workspaceHashDir) {
    const chatSessionsDir = path.join(workspaceHashDir, 'chatSessions');
    try {
      await fs.access(chatSessionsDir);
    } catch {
      return []; // No chatSessions subfolder — skip silently
    }

    // Extract workspace hash from directory name
    const workspaceHash = path.basename(workspaceHashDir);

    // Resolve the real project path from workspace.json
    const realWorkspacePath = await this._resolveVsCodeWorkspacePath(workspaceHashDir);

    const entries = await fs.readdir(chatSessionsDir);
    const jsonFiles = entries.filter(e => (e.endsWith('.json') || e.endsWith('.jsonl')) && !shouldSkipEntry(e));
    if (jsonFiles.length === 0) return [];

    const sessions = [];
    for (const file of jsonFiles) {
      const fullPath = path.join(chatSessionsDir, file);
      try {
        const stats = await fs.stat(fullPath);
        const raw = await fs.readFile(fullPath, 'utf-8');
        // Support both .json (flat) and .jsonl (incremental patch: kind=0 + kind=2 patches)
        let sessionJson;
        if (file.endsWith('.jsonl')) {
          sessionJson = this._parseVsCodeJsonl(raw);
          if (!sessionJson) continue;
        } else {
          sessionJson = JSON.parse(raw);
        }

        const sessionId = sessionJson.sessionId || path.basename(file).replace(/\.jsonl?$/, '');
        const requests = sessionJson.requests || [];
        if (requests.length === 0) continue;

        const statsWithPath = { ...stats, filePath: fullPath };
        const session = this._buildVsCodeSession(
          sessionId, requests, sessionJson, statsWithPath, workspaceHash,
          realWorkspacePath || workspaceHashDir
        );
        sessions.push(session);
      } catch (err) {
        // Skip malformed files silently
      }
    }
    return sessions;
  }

  /** Extract plain text from a VSCode message object */
  /**
   * Build a VSCode Session object from parsed JSONL data.
   * Single source of truth for VSCode session construction — used by both
   * the main scan loop and _findVsCodeSession to avoid duplicate logic.
   * @private
   */
  _buildVsCodeSession(sessionId, requests, sessionJson, stats, workspaceHash, workspaceCwd) {
    const firstReq = requests[0];
    const lastReq = requests[requests.length - 1];

    const createdAt = sessionJson.creationDate
      ? new Date(sessionJson.creationDate)
      : (firstReq.timestamp ? new Date(firstReq.timestamp) : stats.birthtime);

    const lastReqTime = lastReq.timestamp ? new Date(lastReq.timestamp) : null;
    const fallbackUpdatedAt = sessionJson.lastMessageDate
      ? new Date(sessionJson.lastMessageDate)
      : (lastReqTime || stats.mtime);

    // Use last terminal command timestamp (truest end time for agentic sessions).
    // terminalCommandState.timestamp = when the agent actually executed a command.
    // request.timestamp = when the user sent the message (start of turn, not end).
    // mtime is unreliable — VSCode syncs/touches all files when the workspace opens.
    const lastTerminalTime = this._extractLastTerminalTimestamp(requests);
    const effectiveEndTime = lastTerminalTime || lastReqTime || fallbackUpdatedAt;

    const isWip = (Date.now() - effectiveEndTime.getTime()) < 15 * 60 * 1000;
    const userText = this._extractVsCodeUserText(firstReq.message);
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

  _extractVsCodeUserText(message) {
    if (!message) return '';
    if (typeof message.text === 'string') return message.text;
    if (Array.isArray(message.parts)) {
      return message.parts.filter(p => p.kind === 'text').map(p => p.text || '').join('');
    }
    return '';
  }

  /**
   * Read first line of a file
   * @private
   */
  async _readFirstLine(filePath) {
    const fs = require('fs');
    const readline = require('readline');
    
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ 
        input: stream, 
        crlfDelay: Infinity 
      });

      let resolved = false;

      rl.on('line', (line) => {
        if (!resolved) {
          resolved = true;
          rl.close();
          resolve(line.trim());
        }
      });

      rl.on('close', () => {
        if (!resolved) {
          resolve(null);
        }
      });

      rl.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      stream.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          rl.close();
          reject(err);
        }
      });
    });
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
