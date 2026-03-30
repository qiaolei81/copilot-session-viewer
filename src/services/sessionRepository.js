const fs = require('fs').promises;
const { shouldSkipEntry } = require('../utils/fileUtils');
const { registry } = require('../adapters');

/**
 * Session Repository - Data access layer for sessions
 *
 * Delegates all source-specific logic to Source Adapters registered
 * in the adapter registry. This class handles only cross-cutting
 * concerns: caching, deduplication, sorting, and orchestration.
 */
class SessionRepository {
  constructor(sessionDirs) {
    this.registry = registry;

    // Build the sources list from the adapter registry
    // Support both old (single dir) and new (multi-source) initialization
    if (typeof sessionDirs === 'string') {
      // Backward compatibility: single directory treated as copilot
      this.sources = [{
        type: 'copilot',
        dir: sessionDirs
      }];
    } else if (Array.isArray(sessionDirs)) {
      this.sources = sessionDirs;
    } else {
      // Default: build sources from all registered adapters
      this.sources = this.registry.all().map(adapter => ({
        type: adapter.type,
        dir: adapter.getDefaultDir()
      }));
      // Apply env var overrides
      for (const source of this.sources) {
        const adapter = this.registry.get(source.type);
        if (adapter && adapter.envVar && process.env[adapter.envVar]) {
          source.dir = process.env[adapter.envVar];
        }
        // Legacy SESSION_DIR fallback for copilot
        if (source.type === 'copilot' && process.env.SESSION_DIR && !process.env.COPILOT_SESSION_DIR) {
          source.dir = process.env.SESSION_DIR;
        }
      }
    }

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
   * @param {string|null} sourceType - Optional source type filter
   * @returns {Promise<import('../models/Session')[]>}
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
   * Scan a single source via its adapter.
   * @private
   */
  async _scanSource(source) {
    const adapter = this.registry.get(source.type);
    if (!adapter) {
      console.warn(`No adapter registered for source type: ${source.type}`);
      return [];
    }

    // Resolve directory — adapter handles candidates (e.g. VSCode stable/Insiders)
    let dir;
    if (source.dir) {
      dir = source.dir;
    } else {
      dir = await adapter.resolveDir();
    }

    if (!dir) {
      console.warn(`No directory resolved for ${source.type}`);
      return [];
    }

    try {
      await fs.access(dir);
    } catch {
      console.warn(`Source directory not found: ${dir}`);
      return [];
    }

    return adapter.scanEntries(dir);
  }

  /**
   * Deduplicate sessions with the same ID.
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
   * Find session by ID (searches all sources via adapters).
   * @param {string} sessionId - Session ID
   * @returns {Promise<import('../models/Session')|null>}
   */
  async findById(sessionId) {
    if (shouldSkipEntry(sessionId)) return null;

    for (const source of this.sources) {
      const adapter = this.registry.get(source.type);
      if (!adapter) continue;

      // Resolve directory
      let dir;
      if (source.dir) {
        dir = source.dir;
      } else {
        dir = await adapter.resolveDir();
      }
      if (!dir) continue;

      const session = await adapter.findById(sessionId, dir);
      if (session) return session;
    }

    return null;
  }


  /**
   * Sort sessions by updated time (newest first)
   * @private
   */
  _sortByUpdatedAt(sessions) {
    return sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

module.exports = SessionRepository;
