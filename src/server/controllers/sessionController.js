const SessionService = require('../services/sessionService');
const { isValidSessionId } = require('../utils/helpers');
const { resolveSource } = require('../utils/sourceMapping');
const { trackEvent, trackMetric: _trackMetric } = require('../telemetry');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

class SessionController {
  constructor(sessionService = null) {
    this.sessionService = sessionService || new SessionService();
  }

  // ── Helper to get sessionId from either new or legacy param ──
  _getSessionId(req) {
    return req.params.sessionId || req.params.id;
  }

  // API: Get sessions with optional pagination
  async getSessions(req, res) {
    try {
      // New route: source from path param; legacy: source from query
      const sourceParam = req.params.source || null;
      const sourceFilter = sourceParam
        ? resolveSource(sourceParam)
        : (req.query.source || null);

      const offset = req.query.offset !== undefined ? parseInt(req.query.offset) : null;
      const limit = req.query.limit ? parseInt(req.query.limit) : null;
      const page = req.query.page ? parseInt(req.query.page) : null;

      // offset+limit pagination (new API)
      if (offset !== null && limit) {
        if (offset < 0 || limit < 1 || limit > 100) {
          return res.status(400).json({ error: 'Invalid pagination parameters' });
        }
        const pageNum = Math.floor(offset / limit) + 1;
        const paginationData = await this.sessionService.getPaginatedSessions(pageNum, limit, sourceFilter);

        trackEvent('SessionListLoaded', {
          offset: offset.toString(),
          limit: limit.toString(),
          totalSessions: paginationData.totalSessions.toString()
        });

        res.set({ 'Cache-Control': 'public, max-age=60' });
        res.json({
          sessions: paginationData.sessions,
          hasMore: paginationData.hasNextPage ?? (offset + limit < paginationData.totalSessions),
          totalSessions: paginationData.totalSessions
        });
      } else if (page && limit) {
        // Legacy page+limit pagination
        if (page < 1 || limit < 1 || limit > 100) {
          return res.status(400).json({ error: 'Invalid pagination parameters' });
        }
        const paginationData = await this.sessionService.getPaginatedSessions(page, limit, sourceFilter);

        trackEvent('SessionListLoaded', {
          page: page.toString(),
          limit: limit.toString(),
          totalSessions: paginationData.totalSessions.toString()
        });

        res.set({ 'Cache-Control': 'public, max-age=60' });
        res.json(paginationData);
      } else if (sourceFilter && limit) {
        // Source-filtered first page (for pill switching)
        const sessions = await this.sessionService.getAllSessions(sourceFilter);
        const sliced = sessions.slice(0, limit);
        res.set({ 'Cache-Control': 'public, max-age=60' });
        res.json({ sessions: sliced, hasMore: sessions.length > limit, totalSessions: sessions.length });
      } else {
        // Return all sessions for backward compatibility
        const sessions = await this.sessionService.getAllSessions(sourceFilter);
        res.set({ 'Cache-Control': 'public, max-age=300' });
        res.json(sessions);
      }
    } catch (err) {
      console.error('Error loading sessions:', err);
      res.status(500).json({ error: 'Error loading sessions' });
    }
  }

  // API: Get session metadata
  async getSessionById(req, res) {
    try {
      const sessionId = this._getSessionId(req);
      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }
      const session = await this.sessionService.getSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      trackEvent('SessionViewed', { sessionId, source: session.source || 'unknown' });
      res.json(session);
    } catch (err) {
      console.error('Error loading session:', err);
      res.status(500).json({ error: 'Failed to load session' });
    }
  }

  async getSessionEvents(req, res) {
    try {
      const sessionId = this._getSessionId(req);

      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const isPaginationRequested = req.query.limit !== undefined || req.query.offset !== undefined;

      let limit, offset, result;

      if (isPaginationRequested) {
        limit = parseInt(req.query.limit) || 100;
        offset = parseInt(req.query.offset) || 0;

        if (limit < 1 || limit > 1000) {
          return res.status(400).json({ error: 'Limit must be between 1 and 1000' });
        }
        if (offset < 0) {
          return res.status(400).json({ error: 'Offset must be non-negative' });
        }
      }

      const session = await this.sessionService.sessionRepository.findById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (isPaginationRequested) {
        result = await this.sessionService.getSessionEvents(sessionId, { limit, offset });
      } else {
        const events = await this.sessionService.getSessionEvents(sessionId);
        result = events;
      }

      res.set({
        'Cache-Control': 'no-store',
        'Vary': 'Accept-Encoding'
      });

      if (isPaginationRequested) {
        res.json({
          events: result.events,
          pagination: {
            total: result.total,
            limit,
            offset,
            hasMore: offset + limit < result.total
          }
        });
        trackEvent('SessionEventsLoaded', { sessionId, source: session.source || 'unknown', eventCount: result.total, paginated: true });
      } else {
        res.json(result);
        trackEvent('SessionEventsLoaded', { sessionId, source: session.source || 'unknown', eventCount: Array.isArray(result) ? result.length : 0, paginated: false });
      }
    } catch (err) {
      console.error('Error loading events:', err);
      res.status(500).json({ error: 'Error loading events' });
    }
  }

  // API: Get timeline data (source-agnostic)
  async getTimeline(req, res) {
    try {
      const sessionId = this._getSessionId(req);

      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const session = await this.sessionService.getSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const timeline = await this.sessionService.getTimeline(sessionId);

      const crypto = require('crypto');
      const etagBase = `${sessionId}-timeline-${session.updatedAt || session.createdAt}`;
      const etag = crypto.createHash('md5').update(etagBase).digest('hex');

      res.set({
        'ETag': etag,
        'Cache-Control': 'private, max-age=300',
        'Vary': 'Accept-Encoding'
      });

      trackEvent('TimelineViewed', { sessionId, source: session.source || 'unknown' });
      res.json(timeline);
    } catch (err) {
      console.error('Error loading timeline:', err);
      res.status(500).json({ error: 'Error loading timeline' });
    }
  }

  // Export session as zip
  async exportSession(req, res) {
    const sessionId = this._getSessionId(req);

    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    try {
      const session = await this.sessionService.sessionRepository.findById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      let sessionPath;
      let isDirectory = false;

      if (session.directory) {
        try {
          const stats = await fs.promises.stat(session.directory);
          if (stats.isDirectory()) {
            sessionPath = session.directory;
            isDirectory = true;
          }
        } catch {
          // Fall through to filePath
        }
      }

      if (!sessionPath && session.filePath) {
        try {
          await fs.promises.access(session.filePath);
          sessionPath = session.filePath;
        } catch {
          // Not accessible
        }
      }

      // Legacy source-specific lookup as fallback
      if (!sessionPath) {
        if (session.source === 'copilot') {
          const copilotSource = this.sessionService.sessionRepository.sources.find(s => s.type === 'copilot');
          if (copilotSource) {
            const basePath = path.join(copilotSource.dir, sessionId);
            try {
              const stats = await fs.promises.stat(basePath);
              if (stats.isDirectory()) {
                sessionPath = basePath;
                isDirectory = true;
              } else {
                sessionPath = `${basePath}.jsonl`;
              }
            } catch {
              sessionPath = `${basePath}.jsonl`;
            }
          }
        } else if (session.source === 'claude') {
          const claudeSource = this.sessionService.sessionRepository.sources.find(s => s.type === 'claude');
          if (claudeSource) {
            const projectDirs = await fs.promises.readdir(path.join(claudeSource.dir, 'projects'));
            for (const projectDir of projectDirs) {
              const candidatePath = path.join(claudeSource.dir, 'projects', projectDir, `${sessionId}.jsonl`);
              try {
                await fs.promises.access(candidatePath);
                sessionPath = candidatePath;
                break;
              } catch {
                // Try next project
              }
            }
          }
        } else if (session.source === 'pi-mono') {
          const piMonoSource = this.sessionService.sessionRepository.sources.find(s => s.type === 'pi-mono');
          if (piMonoSource) {
            const files = await fs.promises.readdir(piMonoSource.dir);
            const matchingFile = files.find(f => f.includes(sessionId) && f.endsWith('.jsonl'));
            if (matchingFile) {
              sessionPath = path.join(piMonoSource.dir, matchingFile);
            }
          }
        }
      }

      if (!sessionPath) {
        return res.status(404).json({ error: 'Session file not found' });
      }

      try {
        await fs.promises.access(sessionPath);
      } catch {
        return res.status(404).json({ error: 'Session file not accessible' });
      }

      const zip = new AdmZip();

      if (isDirectory) {
        zip.addLocalFolder(sessionPath, sessionId);
      } else {
        const fileName = path.basename(sessionPath);
        zip.addLocalFile(sessionPath, '', fileName);

        const TagService = require('../services/tagService');
        const tagService = new TagService();
        const tagsFilePath = tagService.getSessionTagsFilePath(session);
        try {
          await fs.promises.access(tagsFilePath);
          zip.addLocalFile(tagsFilePath, '', path.basename(tagsFilePath));
        } catch {
          // No tags file, skip
        }
      }

      const zipBuffer = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="session-${sessionId}.zip"`);

      trackEvent('SessionExported', { sessionId });

      res.send(zipBuffer);
    } catch (err) {
      console.error('Error exporting session:', err);
      res.status(500).json({ error: 'Error exporting session' });
    }
  }

}

module.exports = SessionController;
