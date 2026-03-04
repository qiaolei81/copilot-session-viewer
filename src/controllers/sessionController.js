const SessionService = require('../services/sessionService');
const { isValidSessionId } = require('../utils/helpers');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

class SessionController {
  constructor(sessionService = null) {
    this.sessionService = sessionService || new SessionService();
  }

  // Homepage with initial load (first batch)
  async getHomepage(req, res) {
    try {
      const initialLimit = 100; // Load first 100 sessions to ensure Pi-Mono sessions are included
      const paginationData = await this.sessionService.getPaginatedSessions(1, initialLimit);

      // Pass data for infinite scroll
      const templateData = {
        sessions: paginationData.sessions,
        hasMore: paginationData.hasNextPage,
        totalSessions: paginationData.totalSessions
      };

      res.render('index', templateData);
    } catch (err) {
      console.error('Error loading sessions:', err);
      res.status(500).send('Error loading sessions');
    }
  }

  // Session detail page
  async getSessionDetail(req, res) {
    try {
      const sessionId = req.params.id;

      // Validate session ID format
      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const sessionData = await this.sessionService.getSessionWithEvents(sessionId);

      if (!sessionData) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const { events, metadata } = sessionData;
      res.render('session-vue', { sessionId, events, metadata });
    } catch (err) {
      console.error('Error loading session:', err);
      res.status(500).json({ error: 'Error loading session' });
    }
  }

  // Time analysis page
  async getTimeAnalysis(req, res) {
    try {
      const sessionId = req.params.id;

      // Validate session ID format
      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const sessionData = await this.sessionService.getSessionWithEvents(sessionId);

      if (!sessionData) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const { events, metadata } = sessionData;
      // Use original time-analyze view (supports all sources via normalized events)
      res.render('time-analyze', { sessionId, events, metadata });
    } catch (err) {
      console.error('Error loading time analysis:', err);
      res.status(500).json({ error: 'Error loading analysis' });
    }
  }

  // API: Get sessions with optional pagination
  async getSessions(req, res) {
    try {
      const page = req.query.page ? parseInt(req.query.page) : null;
      const limit = req.query.limit ? parseInt(req.query.limit) : null;
      const sourceFilter = req.query.source || null;

      if (page && limit) {
        // Return paginated response
        if (page < 1 || limit < 1 || limit > 100) {
          return res.status(400).json({ error: 'Invalid pagination parameters' });
        }
        const paginationData = await this.sessionService.getPaginatedSessions(page, limit);
        res.set({ 'Cache-Control': 'public, max-age=60' });
        res.json(paginationData);
      } else if (sourceFilter && limit) {
        // Source-filtered first page (for pill switching)
        let sessions = await this.sessionService.getAllSessions();
        sessions = sessions.filter(s => s.source === sourceFilter);
        const sliced = sessions.slice(0, limit);
        res.set({ 'Cache-Control': 'public, max-age=60' });
        res.json({ sessions: sliced, hasMore: sessions.length > limit, totalSessions: sessions.length });
      } else {
        // Return all sessions for backward compatibility
        let sessions = await this.sessionService.getAllSessions();
        if (sourceFilter) {
          sessions = sessions.filter(s => s.source === sourceFilter);
        }
        res.set({ 'Cache-Control': 'public, max-age=300' });
        res.json(sessions);
      }
    } catch (err) {
      console.error('Error loading sessions:', err);
      res.status(500).json({ error: 'Error loading sessions' });
    }
  }

    // API: Load more sessions for infinite scroll
  async loadMoreSessions(req, res) {
    try {
      const offset = parseInt(req.query.offset) || 0;
      const limit = parseInt(req.query.limit) || 20;

      // Validate parameters
      if (offset < 0 || limit < 1 || limit > 50) {
        return res.status(400).json({ error: 'Invalid parameters' });
      }

      // Calculate page number from offset
      const page = Math.floor(offset / limit) + 1;
      const paginationData = await this.sessionService.getPaginatedSessions(page, limit);

      res.json({
        sessions: paginationData.sessions,
        hasMore: paginationData.hasNextPage,
        totalSessions: paginationData.totalSessions
      });
    } catch (err) {
      console.error('Error loading more sessions:', err);
      res.status(500).json({ error: 'Error loading more sessions' });
    }
  }

  // API: Get session events
  async getSessionEvents(req, res) {
    try {
      const sessionId = req.params.id;

      // Validate session ID format
      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      // Check if pagination is requested
      const isPaginationRequested = req.query.limit !== undefined || req.query.offset !== undefined;

      // Parse pagination parameters (only if requested)
      let limit, offset, result;
      
      if (isPaginationRequested) {
        limit = parseInt(req.query.limit) || 100; // Default 100 events per page
        offset = parseInt(req.query.offset) || 0;

        // Validate pagination parameters
        if (limit < 1 || limit > 1000) {
          return res.status(400).json({ error: 'Limit must be between 1 and 1000' });
        }
        if (offset < 0) {
          return res.status(400).json({ error: 'Offset must be non-negative' });
        }
      }

      // Get session metadata for ETag generation
      const session = await this.sessionService.getSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Generate ETag from session ID + timestamp + pagination params (if used)
      const crypto = require('crypto');
      const etagBase = isPaginationRequested 
        ? `${sessionId}-${session.updatedAt || session.createdAt}-${limit}-${offset}`
        : `${sessionId}-${session.updatedAt || session.createdAt}`;
      const etag = crypto.createHash('md5').update(etagBase).digest('hex');

      // Check If-None-Match header (client cache)
      const clientEtag = req.headers['if-none-match'];
      if (clientEtag === etag) {
        return res.status(304).end(); // Not Modified - use cached version
      }

      // Load events (with or without pagination)
      if (isPaginationRequested) {
        result = await this.sessionService.getSessionEvents(sessionId, { limit, offset });
      } else {
        // Load all events (backward compatibility)
        const events = await this.sessionService.getSessionEvents(sessionId);
        result = events; // Direct array
      }

      // Set caching headers
      res.set({
        'ETag': etag,
        'Cache-Control': 'private, max-age=0, no-cache', // Disable cache during development
        'Vary': 'Accept-Encoding'
      });

      // Return response (paginated or plain array)
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
      } else {
        res.json(result); // Plain array for backward compatibility
      }
    } catch (err) {
      console.error('Error loading events:', err);
      res.status(500).json({ error: 'Error loading events' });
    }
  }

  // API: Get timeline data (source-agnostic)
  async getTimeline(req, res) {
    try {
      const sessionId = req.params.id;

      // Validate session ID format
      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const session = await this.sessionService.getSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Generate unified timeline structure
      const timeline = await this.sessionService.getTimeline(sessionId);

      // Set caching headers
      const crypto = require('crypto');
      const etagBase = `${sessionId}-timeline-${session.updatedAt || session.createdAt}`;
      const etag = crypto.createHash('md5').update(etagBase).digest('hex');

      res.set({
        'ETag': etag,
        'Cache-Control': 'private, max-age=300',
        'Vary': 'Accept-Encoding'
      });

      res.json(timeline);
    } catch (err) {
      console.error('Error loading timeline:', err);
      res.status(500).json({ error: 'Error loading timeline' });
    }
  }

  // Export session as zip
  async exportSession(req, res) {
    const sessionId = req.params.id;

    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    try {
      // Get session to verify it exists and get its source
      const session = await this.sessionService.sessionRepository.findById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Find session file/directory path based on source
      let sessionPath;
      let isDirectory = false;

      if (session.source === 'copilot') {
        const copilotSource = this.sessionService.sessionRepository.sources.find(s => s.type === 'copilot');
        if (!copilotSource) {
          return res.status(404).json({ error: 'Copilot source not found' });
        }

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
      } else if (session.source === 'claude') {
        const claudeSource = this.sessionService.sessionRepository.sources.find(s => s.type === 'claude');
        if (!claudeSource) {
          return res.status(404).json({ error: 'Claude source not found' });
        }

        // Claude sessions are in projects/*/sessionId.jsonl
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

        if (!sessionPath) {
          return res.status(404).json({ error: 'Session file not found' });
        }
      } else if (session.source === 'pi-mono') {
        const piMonoSource = this.sessionService.sessionRepository.sources.find(s => s.type === 'pi-mono');
        if (!piMonoSource) {
          return res.status(404).json({ error: 'Pi-Mono source not found' });
        }

        // Pi-Mono sessions are timestamp-based JSONL files
        const files = await fs.promises.readdir(piMonoSource.dir);
        const matchingFile = files.find(f => f.includes(sessionId) && f.endsWith('.jsonl'));
        if (!matchingFile) {
          return res.status(404).json({ error: 'Session file not found' });
        }
        sessionPath = path.join(piMonoSource.dir, matchingFile);
      }

      if (!sessionPath) {
        return res.status(404).json({ error: 'Session file not found' });
      }

      // Verify path exists
      try {
        await fs.promises.access(sessionPath);
      } catch {
        return res.status(404).json({ error: 'Session file not accessible' });
      }

      // Create zip
      const zip = new AdmZip();

      if (isDirectory) {
        // Add entire directory
        zip.addLocalFolder(sessionPath, sessionId);
      } else {
        // Add single file
        const fileName = path.basename(sessionPath);
        zip.addLocalFile(sessionPath, '', fileName);
      }

      // Send zip file
      const zipBuffer = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="session-${sessionId}.zip"`);
      res.send(zipBuffer);
    } catch (err) {
      console.error('Error exporting session:', err);
      res.status(500).json({ error: 'Error exporting session' });
    }
  }
}

module.exports = SessionController;