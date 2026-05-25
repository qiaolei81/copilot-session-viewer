const InsightService = require('../services/insightService');
const { isValidSessionId } = require('../utils/helpers');
const { trackEvent, trackMetric, trackException } = require('../telemetry');

class InsightController {
  constructor(insightService = null, sessionService = null) {
    if (insightService) {
      this.insightService = insightService;
    } else {
      // Use default multi-source configuration
      this.insightService = new InsightService();
    }
    
    // SessionService for getting session metadata (source)
    if (sessionService) {
      this.sessionService = sessionService;
    } else {
      const SessionService = require('../services/sessionService');
      this.sessionService = new SessionService();
    }
  }

  _getGenerateInsightErrorResponse(err) {
    if (err instanceof Error) {
      if (err.message === 'Events file not found') {
        return { status: 400, body: { error: err.message } };
      }

      if (err.message === 'Failed to acquire lock for insight generation') {
        return { status: 503, body: { error: err.message } };
      }

      if (err.message) {
        return { status: 500, body: { error: err.message } };
      }
    }

    return { status: 500, body: { error: 'Error generating insight' } };
  }

  // Generate or get insight
  async generateInsight(req, res) {
    try {
      const sessionId = req.params.id;
      const forceRegenerate = req.body?.force === true;

      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      // Get session to determine source and directory
      const session = await this.sessionService.getSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (!session.directory) {
        return res.status(400).json({ error: 'Session directory not available' });
      }

      const startTime = Date.now();
      const result = await this.insightService.generateInsight(session.id, session.directory, session.source, forceRegenerate);
      const durationMs = Date.now() - startTime;

      // Track InsightGenerated event
      trackEvent('InsightGenerated', {
        sessionId,
        source: session.source || 'unknown',
        durationMs: durationMs.toString()
      });

      // Track InsightGenerationTime metric
      trackMetric('InsightGenerationTime', durationMs, { sessionId, source: session.source || 'unknown' });

      res.json(result);
    } catch (err) {
      console.error('Error generating insight:', err);

      // Track insight generation failure
      trackException(err, {
        sessionId: req.params.id,
        operation: 'generateInsight'
      });

      const errorResponse = this._getGenerateInsightErrorResponse(err);
      res.status(errorResponse.status).json(errorResponse.body);
    }
  }

  // Get insight status
  async getInsightStatus(req, res) {
    try {
      const sessionId = req.params.id;

      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      // Get session to determine directory
      const session = await this.sessionService.getSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (!session.directory) {
        return res.status(400).json({ error: 'Session directory not available' });
      }

      const result = await this.insightService.getInsightStatus(session.id, session.directory, session.source);

      // Track InsightViewed event if insight is ready
      if (result.status === 'ready' && result.report) {
        trackEvent('InsightViewed', { sessionId });
      }

      res.json(result);
    } catch (err) {
      console.error('Error getting insight status:', err);
      res.status(500).json({ error: 'Error getting insight status' });
    }
  }

  // Delete insight
  async deleteInsight(req, res) {
    try {
      const sessionId = req.params.id;

      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      // Get session to determine directory
      const session = await this.sessionService.getSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (!session.directory) {
        return res.status(400).json({ error: 'Session directory not available' });
      }

      const result = await this.insightService.deleteInsight(session.id, session.directory, session.source);

      // Track InsightDeleted event
      trackEvent('InsightDeleted', { sessionId });

      res.json(result);
    } catch (err) {
      console.error('Error deleting insight:', err);
      res.status(500).json({ error: 'Error deleting insight' });
    }
  }
}

module.exports = InsightController;