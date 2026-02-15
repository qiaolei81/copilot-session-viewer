const SessionService = require('../services/sessionService');
const { isValidSessionId } = require('../utils/helpers');

class SessionController {
  constructor(sessionService = null) {
    this.sessionService = sessionService || new SessionService();
  }

  // Homepage with initial load (first batch)
  async getHomepage(req, res) {
    try {
      const initialLimit = 20; // Load first 20 sessions
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

      if (page && limit) {
        // Return paginated response
        if (page < 1 || limit < 1 || limit > 100) {
          return res.status(400).json({ error: 'Invalid pagination parameters' });
        }
        const paginationData = await this.sessionService.getPaginatedSessions(page, limit);

        // Set cache headers for paginated data (shorter cache)
        res.set({
          'Cache-Control': 'public, max-age=60', // 1 minute cache
          'ETag': `"sessions-page-${page}-${limit}-${Date.now()}"`,
          'Vary': 'Accept-Encoding'
        });

        res.json(paginationData);
      } else {
        // Return all sessions for backward compatibility
        const sessions = await this.sessionService.getAllSessions();

        // Set cache headers for full session list
        res.set({
          'Cache-Control': 'public, max-age=300', // 5 minute cache
          'ETag': `"sessions-all-${Date.now()}"`,
          'Vary': 'Accept-Encoding'
        });

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

      const events = await this.sessionService.getSessionEvents(sessionId);
      res.json(events);
    } catch (err) {
      console.error('Error loading events:', err);
      res.status(500).json({ error: 'Error loading events' });
    }
  }
}

module.exports = SessionController;