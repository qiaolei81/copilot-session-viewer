const TagService = require('../services/tagService');
const SessionRepository = require('../services/sessionRepository');
const { isValidSessionId } = require('../utils/helpers');
const { trackEvent } = require('../telemetry');

class TagController {
  constructor(tagService = null, sessionRepository = null) {
    this.tagService = tagService || new TagService();
    this.sessionRepository = sessionRepository || new SessionRepository();
  }

  // Helper to get sessionId from either new or legacy param
  _getSessionId(req) {
    return req.params.sessionId || req.params.id;
  }

  /**
   * GET /api/tags
   * Get all unique tags across all sessions (for autocomplete)
   */
  async getAllTags(req, res) {
    try {
      const tags = await this.tagService.getAllKnownTags();
      res.json({ tags });
    } catch (err) {
      console.error('Error getting all tags:', err);
      res.status(500).json({ error: 'Error loading tags' });
    }
  }

  /**
   * GET /api/:source/sessions/:sessionId/tags
   * Get tags for a specific session
   */
  async getSessionTags(req, res) {
    try {
      const sessionId = this._getSessionId(req);

      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const session = await this.sessionRepository.findById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const tags = await this.tagService.getSessionTags(session);
      res.json({ tags });
    } catch (err) {
      console.error('Error getting session tags:', err);
      res.status(500).json({ error: 'Error loading session tags' });
    }
  }

  /**
   * PUT /api/:source/sessions/:sessionId/tags
   * Set tags for a specific session
   * Body: { tags: ["tag1", "tag2"] }
   */
  async setSessionTags(req, res) {
    try {
      const sessionId = this._getSessionId(req);
      const { tags } = req.body;

      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' });
      }

      if (tags.length > 10) {
        return res.status(400).json({ error: 'Maximum 10 tags per session' });
      }

      for (const tag of tags) {
        if (typeof tag !== 'string' || tag.trim().length === 0) {
          return res.status(400).json({ error: 'Tags must be non-empty strings' });
        }
        if (tag.length > 30) {
          return res.status(400).json({ error: 'Tag length must not exceed 30 characters' });
        }
      }

      const session = await this.sessionRepository.findById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const savedTags = await this.tagService.setSessionTags(session, tags);

      trackEvent('TagUpdated', {
        sessionId,
        tagCount: savedTags.length.toString()
      });

      res.json({ tags: savedTags });
    } catch (err) {
      console.error('Error setting session tags:', err);
      if (err.message === 'Maximum 10 tags per session') {
        return res.status(400).json({ error: err.message });
      }
      if (err.message === 'Session must have a directory field') {
        return res.status(400).json({ error: 'Session does not support tagging' });
      }
      res.status(500).json({ error: 'Error saving session tags' });
    }
  }

}

module.exports = TagController;
