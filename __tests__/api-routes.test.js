const request = require('supertest');
const createApp = require('../src/server/app');

/**
 * Comprehensive API integration tests for all source-scoped routes.
 * Uses mocked services injected into createApp().
 */
describe('API Routes Integration Tests', () => {
  let app;
  let mockSessionService;
  let mockInsightService;
  let mockTagService;

  const VALID_SOURCE = 'copilot-cli';
  const VALID_SESSION_ID = 'abc123-valid-session';
  const INVALID_SESSION_ID = 'invalid..id';

  const mockSession = {
    id: VALID_SESSION_ID,
    source: 'copilot',
    summary: 'Test session',
    directory: '/path/to/session',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z'
  };

  beforeEach(() => {
    mockSessionService = {
      getAllSessions: jest.fn(),
      getPaginatedSessions: jest.fn(),
      getSessionById: jest.fn(),
      getSessionEvents: jest.fn(),
      getSessionWithEvents: jest.fn(),
      getTimeline: jest.fn(),
      sessionRepository: {
        findById: jest.fn(),
        sources: []
      }
    };

    mockInsightService = {
      generateInsight: jest.fn(),
      getInsightStatus: jest.fn(),
      deleteInsight: jest.fn()
    };

    mockTagService = {
      getAllKnownTags: jest.fn(),
      getSessionTags: jest.fn(),
      setSessionTags: jest.fn()
    };

    app = createApp({
      sessionService: mockSessionService,
      insightService: mockInsightService,
      tagService: mockTagService
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /api/sources ──
  describe('GET /api/sources', () => {
    it('should return an array of source objects with id and label', async () => {
      const response = await request(app)
        .get('/api/sources')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      for (const source of response.body) {
        expect(source).toHaveProperty('id');
        expect(source).toHaveProperty('label');
        expect(typeof source.id).toBe('string');
        expect(typeof source.label).toBe('string');
      }
    });

    it('should include known sources', async () => {
      const response = await request(app).get('/api/sources').expect(200);
      const ids = response.body.map(s => s.id);
      expect(ids).toContain('copilot-cli');
      expect(ids).toContain('claude');
    });
  });

  // ── GET /api/:source/sessions ──
  describe('GET /api/:source/sessions', () => {
    it('should return all sessions without pagination', async () => {
      const sessions = [{ id: 's1' }, { id: 's2' }];
      mockSessionService.getAllSessions.mockResolvedValue(sessions);

      const response = await request(app)
        .get(`/api/${VALID_SOURCE}/sessions`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(mockSessionService.getAllSessions).toHaveBeenCalledWith('copilot');
    });

    it('should support offset/limit pagination', async () => {
      mockSessionService.getPaginatedSessions.mockResolvedValue({
        sessions: [{ id: 's10' }],
        totalSessions: 100,
        hasNextPage: true
      });

      const response = await request(app)
        .get(`/api/${VALID_SOURCE}/sessions?offset=0&limit=10`)
        .expect(200);

      expect(response.body.sessions).toBeDefined();
      expect(response.body.totalSessions).toBe(100);
      expect(response.body.hasMore).toBeDefined();
    });

    it('should reject negative offset', async () => {
      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions?offset=-5&limit=10`)
        .expect(400);
    });

    it('should reject limit > 100', async () => {
      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions?offset=0&limit=200`)
        .expect(400);
    });

    it('should reject limit < 1', async () => {
      // limit=0 is falsy so offset+limit branch is skipped; use limit=-1 instead
      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions?offset=0&limit=-1`)
        .expect(400);
    });

    it('should handle server errors gracefully', async () => {
      mockSessionService.getAllSessions.mockRejectedValue(new Error('fail'));

      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions`)
        .expect(500);
    });
  });

  // ── GET /api/:source/sessions/:sessionId ──
  describe('GET /api/:source/sessions/:sessionId', () => {
    it('should return session metadata', async () => {
      mockSessionService.getSessionById.mockResolvedValue(mockSession);

      const response = await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}`)
        .expect(200);

      expect(response.body.id).toBe(VALID_SESSION_ID);
    });

    it('should return 400 for invalid sessionId', async () => {
      const response = await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}`)
        .expect(400);

      expect(response.body.error).toMatch(/invalid/i);
    });

    it('should return 404 when session not found', async () => {
      mockSessionService.getSessionById.mockResolvedValue(null);

      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/nonexistent-session`)
        .expect(404);
    });
  });

  // ── GET /api/:source/sessions/:sessionId/events ──
  describe('GET /api/:source/sessions/:sessionId/events', () => {
    beforeEach(() => {
      mockSessionService.sessionRepository.findById.mockResolvedValue(mockSession);
    });

    it('should return all events without pagination params', async () => {
      const events = [{ type: 'msg', text: 'hi' }, { type: 'msg', text: 'bye' }];
      mockSessionService.getSessionEvents.mockResolvedValue(events);

      const response = await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}/events`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
    });

    it('should return paginated events with offset/limit', async () => {
      mockSessionService.getSessionEvents.mockResolvedValue({
        events: [{ type: 'msg' }],
        total: 200
      });

      const response = await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}/events?offset=10&limit=50`)
        .expect(200);

      expect(response.body.events).toBeDefined();
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(200);
      expect(response.body.pagination.offset).toBe(10);
      expect(response.body.pagination.limit).toBe(50);
      expect(response.body.pagination.hasMore).toBe(true);
    });

    it('should return hasMore=false when no more events', async () => {
      mockSessionService.getSessionEvents.mockResolvedValue({
        events: [{ type: 'msg' }],
        total: 5
      });

      const response = await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}/events?offset=0&limit=10`)
        .expect(200);

      expect(response.body.pagination.hasMore).toBe(false);
    });

    it('should return 400 for invalid sessionId', async () => {
      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/events`)
        .expect(400);
    });

    it('should return 404 when session not found', async () => {
      mockSessionService.sessionRepository.findById.mockResolvedValue(null);

      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/nonexistent-session/events`)
        .expect(404);
    });
  });

  // ── GET /api/:source/sessions/:sessionId/timeline ──
  describe('GET /api/:source/sessions/:sessionId/timeline', () => {
    it('should return timeline data', async () => {
      mockSessionService.getSessionById.mockResolvedValue(mockSession);
      mockSessionService.getTimeline.mockResolvedValue({ phases: [{ name: 'init' }] });

      const response = await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}/timeline`)
        .expect(200);

      expect(response.body.phases).toBeDefined();
    });

    it('should include ETag and Cache-Control headers', async () => {
      mockSessionService.getSessionById.mockResolvedValue(mockSession);
      mockSessionService.getTimeline.mockResolvedValue({ phases: [] });

      const response = await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}/timeline`)
        .expect(200);

      expect(response.headers['etag']).toBeDefined();
      expect(response.headers['cache-control']).toMatch(/max-age/);
    });

    it('should return 400 for invalid sessionId', async () => {
      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/timeline`)
        .expect(400);
    });

    it('should return 404 when session not found', async () => {
      mockSessionService.getSessionById.mockResolvedValue(null);

      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/nonexistent-session/timeline`)
        .expect(404);
    });
  });

  // ── GET /api/:source/sessions/:sessionId/tags ──
  describe('GET /api/:source/sessions/:sessionId/tags', () => {
    it('should return 400 for invalid sessionId', async () => {
      const response = await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/tags`)
        .expect(400);

      expect(response.body.error).toMatch(/invalid/i);
    });
  });

  // ── PUT /api/:source/sessions/:sessionId/tags ──
  describe('PUT /api/:source/sessions/:sessionId/tags', () => {
    it('should return 400 for invalid sessionId', async () => {
      await request(app)
        .put(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/tags`)
        .send({ tags: ['test'] })
        .expect(400);
    });

    it('should return 400 when tags is not an array', async () => {
      // TagController validates before DB lookup, so this works without mock
      await request(app)
        .put(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}/tags`)
        .send({ tags: 'not-array' })
        .expect(400);
    });
  });

  // ── GET /api/:source/sessions/:sessionId/export ──
  describe('GET /api/:source/sessions/:sessionId/export', () => {
    it('should return 400 for invalid sessionId', async () => {
      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/export`)
        .expect(400);
    });

    it('should return 404 when session not found', async () => {
      mockSessionService.sessionRepository.findById.mockResolvedValue(null);

      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/nonexistent-session/export`)
        .expect(404);
    });
  });

  // ── POST /api/:source/sessions/:sessionId/insight ──
  describe('POST /api/:source/sessions/:sessionId/insight', () => {
    it('should return 400 for invalid sessionId', async () => {
      await request(app)
        .post(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/insight`)
        .expect(400);
    });

    it('should return 404 when session not found', async () => {
      mockSessionService.getSessionById.mockResolvedValue(null);

      await request(app)
        .post(`/api/${VALID_SOURCE}/sessions/nonexistent-session/insight`)
        .expect(404);
    });

    it('should generate insight successfully', async () => {
      mockSessionService.getSessionById.mockResolvedValue(mockSession);
      mockInsightService.generateInsight.mockResolvedValue({
        status: 'completed',
        report: 'Analysis report'
      });

      const response = await request(app)
        .post(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}/insight`)
        .expect(200);

      expect(response.body.status).toBe('completed');
      expect(response.body.report).toBe('Analysis report');
    });

    it('should pass force=true from request body', async () => {
      mockSessionService.getSessionById.mockResolvedValue(mockSession);
      mockInsightService.generateInsight.mockResolvedValue({ status: 'completed' });

      await request(app)
        .post(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}/insight`)
        .send({ force: true })
        .expect(200);

      expect(mockInsightService.generateInsight).toHaveBeenCalledWith(
        VALID_SESSION_ID, '/path/to/session', 'copilot', true
      );
    });

    it('should handle generation errors', async () => {
      mockSessionService.getSessionById.mockResolvedValue(mockSession);
      mockInsightService.generateInsight.mockRejectedValue(new Error('Failed'));

      await request(app)
        .post(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}/insight`)
        .expect(500);
    });
  });

  // ── GET /api/:source/sessions/:sessionId/insight ──
  describe('GET /api/:source/sessions/:sessionId/insight', () => {
    it('should return 400 for invalid sessionId', async () => {
      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/insight`)
        .expect(400);
    });

    it('should return insight status', async () => {
      mockSessionService.getSessionById.mockResolvedValue(mockSession);
      mockInsightService.getInsightStatus.mockResolvedValue({
        status: 'completed',
        report: 'Done'
      });

      const response = await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}/insight`)
        .expect(200);

      expect(response.body.status).toBe('completed');
    });

    it('should return 404 when session not found', async () => {
      mockSessionService.getSessionById.mockResolvedValue(null);

      await request(app)
        .get(`/api/${VALID_SOURCE}/sessions/nonexistent-session/insight`)
        .expect(404);
    });
  });

  // ── DELETE /api/:source/sessions/:sessionId/insight ──
  describe('DELETE /api/:source/sessions/:sessionId/insight', () => {
    it('should return 400 for invalid sessionId', async () => {
      await request(app)
        .delete(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/insight`)
        .expect(400);
    });

    it('should delete insight successfully', async () => {
      mockSessionService.getSessionById.mockResolvedValue(mockSession);
      mockInsightService.deleteInsight.mockResolvedValue({ success: true });

      const response = await request(app)
        .delete(`/api/${VALID_SOURCE}/sessions/${VALID_SESSION_ID}/insight`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 404 when session not found', async () => {
      mockSessionService.getSessionById.mockResolvedValue(null);

      await request(app)
        .delete(`/api/${VALID_SOURCE}/sessions/nonexistent-session/insight`)
        .expect(404);
    });
  });

  // ── POST /api/import ──
  describe('POST /api/import', () => {
    it('should return 400 when no file uploaded', async () => {
      const response = await request(app)
        .post('/api/import')
        .expect(400);

      expect(response.body.error).toBe('No file uploaded');
    });
  });

  // ── GET /api/tags ──
  describe('GET /api/tags', () => {
    it('should return all known tags', async () => {
      mockTagService.getAllKnownTags.mockResolvedValue(['bug', 'feature', 'urgent']);

      const response = await request(app)
        .get('/api/tags')
        .expect(200);

      expect(response.body.tags).toEqual(['bug', 'feature', 'urgent']);
    });

    it('should handle errors', async () => {
      mockTagService.getAllKnownTags.mockRejectedValue(new Error('fail'));

      await request(app)
        .get('/api/tags')
        .expect(500);
    });
  });

  // ── Source validation across all route types ──
  describe('Source validation (invalid source returns 404)', () => {
    const invalidSource = 'nonexistent-source';

    it('GET sessions', async () => {
      await request(app).get(`/api/${invalidSource}/sessions`).expect(404);
    });

    it('GET session detail', async () => {
      await request(app).get(`/api/${invalidSource}/sessions/some-id`).expect(404);
    });

    it('GET events', async () => {
      await request(app).get(`/api/${invalidSource}/sessions/some-id/events`).expect(404);
    });

    it('GET timeline', async () => {
      await request(app).get(`/api/${invalidSource}/sessions/some-id/timeline`).expect(404);
    });

    it('GET export', async () => {
      await request(app).get(`/api/${invalidSource}/sessions/some-id/export`).expect(404);
    });

    it('GET tags', async () => {
      await request(app).get(`/api/${invalidSource}/sessions/some-id/tags`).expect(404);
    });

    it('PUT tags', async () => {
      await request(app).put(`/api/${invalidSource}/sessions/some-id/tags`).send({ tags: [] }).expect(404);
    });

    it('POST insight', async () => {
      await request(app).post(`/api/${invalidSource}/sessions/some-id/insight`).expect(404);
    });

    it('GET insight', async () => {
      await request(app).get(`/api/${invalidSource}/sessions/some-id/insight`).expect(404);
    });

    it('DELETE insight', async () => {
      await request(app).delete(`/api/${invalidSource}/sessions/some-id/insight`).expect(404);
    });
  });

  // ── Invalid sessionId validation across route types ──
  describe('Invalid sessionId returns 400', () => {
    it('GET session detail', async () => {
      await request(app).get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}`).expect(400);
    });

    it('GET events', async () => {
      await request(app).get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/events`).expect(400);
    });

    it('GET timeline', async () => {
      await request(app).get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/timeline`).expect(400);
    });

    it('GET export', async () => {
      await request(app).get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/export`).expect(400);
    });

    it('GET tags', async () => {
      await request(app).get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/tags`).expect(400);
    });

    it('PUT tags', async () => {
      await request(app).put(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/tags`).send({ tags: [] }).expect(400);
    });

    it('POST insight', async () => {
      await request(app).post(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/insight`).expect(400);
    });

    it('GET insight', async () => {
      await request(app).get(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/insight`).expect(400);
    });

    it('DELETE insight', async () => {
      await request(app).delete(`/api/${VALID_SOURCE}/sessions/${INVALID_SESSION_ID}/insight`).expect(400);
    });
  });
});
