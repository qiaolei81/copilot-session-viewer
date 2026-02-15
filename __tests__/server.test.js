const request = require('supertest');
const createApp = require('../src/app');

describe('Server API Endpoints', () => {
  let app;
  let mockSessionService;
  let mockInsightService;

  beforeEach(() => {
    // Create mock services
    mockSessionService = {
      getAllSessions: jest.fn(),
      getPaginatedSessions: jest.fn(),
      getSessionById: jest.fn(),
      getSessionEvents: jest.fn(),
      getSessionWithEvents: jest.fn()
    };

    mockInsightService = {
      generateInsight: jest.fn(),
      getInsightStatus: jest.fn(),
      deleteInsight: jest.fn()
    };

    // Create app with mocked services
    app = createApp({
      sessionService: mockSessionService,
      insightService: mockInsightService
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('should render homepage with sessions', async () => {
      const mockPaginationData = {
        sessions: [
          { id: 'session1', summary: 'Test session 1' },
          { id: 'session2', summary: 'Test session 2' }
        ],
        totalSessions: 2,
        currentPage: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      };

      mockSessionService.getPaginatedSessions.mockResolvedValue(mockPaginationData);

      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.text).toContain('Copilot Session Viewer');
      expect(mockSessionService.getPaginatedSessions).toHaveBeenCalledWith(1, 20);
    });

    it('should render homepage with initial sessions (infinite scroll)', async () => {
      const mockPaginationData = {
        sessions: Array.from({ length: 10 }, (_, i) => ({
          id: `session${i + 10}`,
          summary: `Test session ${i + 10}`
        })),
        totalSessions: 50,
        currentPage: 1,
        totalPages: 5,
        hasNextPage: true,
        hasPrevPage: false
      };

      mockSessionService.getPaginatedSessions.mockResolvedValue(mockPaginationData);

      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.text).toContain('Sessions');
      expect(response.text).toContain('Load More Sessions');
      expect(mockSessionService.getPaginatedSessions).toHaveBeenCalledWith(1, 20);
    });

    it('should ignore legacy pagination parameters', async () => {
      const mockPaginationData = {
        sessions: [
          { id: 'session1', summary: 'Test session 1' },
          { id: 'session2', summary: 'Test session 2' }
        ],
        totalSessions: 2,
        currentPage: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      };

      mockSessionService.getPaginatedSessions.mockResolvedValue(mockPaginationData);

      await request(app)
        .get('/?page=2&limit=10')
        .expect(200);

      // Should still load initial batch, ignoring pagination params
      expect(mockSessionService.getPaginatedSessions).toHaveBeenCalledWith(1, 20);
    });

    it('should handle session loading errors', async () => {
      mockSessionService.getPaginatedSessions.mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/')
        .expect(500);
    });
  });

  describe('GET /api/sessions', () => {
    it('should return all sessions when no pagination', async () => {
      const mockSessions = [
        { id: 'session1', summary: 'Test 1' },
        { id: 'session2', summary: 'Test 2' }
      ];

      mockSessionService.getAllSessions.mockResolvedValue(mockSessions);

      const response = await request(app)
        .get('/api/sessions')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].id).toBe('session1');
      expect(response.body[1].id).toBe('session2');
    });

    it('should return paginated sessions when parameters provided', async () => {
      const mockPaginationData = {
        sessions: Array.from({ length: 10 }, (_, i) => ({
          id: `session${i + 10}`
        })),
        totalSessions: 25,
        currentPage: 2,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true
      };

      mockSessionService.getPaginatedSessions.mockResolvedValue(mockPaginationData);

      const response = await request(app)
        .get('/api/sessions?page=2&limit=10')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body.sessions).toHaveLength(10);
      expect(response.body.currentPage).toBe(2);
      expect(response.body.totalPages).toBe(3);
      expect(response.body.totalSessions).toBe(25);
      expect(response.body.hasNextPage).toBe(true);
      expect(response.body.hasPrevPage).toBe(true);
    });

    it('should handle session loading errors', async () => {
      mockSessionService.getAllSessions.mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/api/sessions')
        .expect(500);
    });
  });

  describe('GET /api/sessions/load-more', () => {
    it('should load more sessions with offset', async () => {
      const mockPaginationData = {
        sessions: Array.from({ length: 20 }, (_, i) => ({
          id: `session${i + 20}`
        })),
        totalSessions: 50,
        currentPage: 2,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true
      };

      mockSessionService.getPaginatedSessions.mockResolvedValue(mockPaginationData);

      const response = await request(app)
        .get('/api/sessions/load-more?offset=20&limit=20')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body.sessions).toHaveLength(20);
      expect(response.body.hasMore).toBe(true);
      expect(response.body.totalSessions).toBe(50);
      expect(mockSessionService.getPaginatedSessions).toHaveBeenCalledWith(2, 20);
    });

    it('should reject invalid offset/limit parameters', async () => {
      await request(app)
        .get('/api/sessions/load-more?offset=-1')
        .expect(400);

      await request(app)
        .get('/api/sessions/load-more?limit=51')
        .expect(400);
    });

    it('should handle load more errors', async () => {
      mockSessionService.getPaginatedSessions.mockRejectedValue(new Error('Database error'));

      await request(app)
        .get('/api/sessions/load-more?offset=20')
        .expect(500);
    });
  });

  describe('GET /session/:id', () => {
    it('should reject invalid session IDs', async () => {
      await request(app)
        .get('/session/invalid..id')
        .expect(400);

      await request(app)
        .get('/session/invalid@id')
        .expect(400);
    });

    it('should return 404 for non-existent sessions', async () => {
      mockSessionService.getSessionWithEvents.mockResolvedValue(null);

      await request(app)
        .get('/session/nonexistent')
        .expect(404);
    });
  });

  describe('POST /session/:id/insight', () => {
    it('should reject invalid session IDs', async () => {
      await request(app)
        .post('/session/invalid..id/insight')
        .expect(400);
    });

    it('should generate insight for valid session', async () => {
      const mockInsight = {
        status: 'completed',
        report: 'Test insight report',
        generatedAt: new Date()
      };

      mockInsightService.generateInsight.mockResolvedValue(mockInsight);

      const response = await request(app)
        .post('/session/valid-session/insight')
        .expect(200);

      expect(response.body.status).toBe('completed');
      expect(mockInsightService.generateInsight).toHaveBeenCalledWith('valid-session', false);
    });

    it('should handle insight generation errors', async () => {
      mockInsightService.generateInsight.mockRejectedValue(new Error('Generation failed'));

      await request(app)
        .post('/session/valid-session/insight')
        .expect(500);
    });
  });

  describe('GET /session/:id/insight', () => {
    it('should get insight status', async () => {
      const mockStatus = {
        status: 'completed',
        report: 'Test report'
      };

      mockInsightService.getInsightStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/session/valid-session/insight')
        .expect(200);

      expect(response.body.status).toBe('completed');
      expect(mockInsightService.getInsightStatus).toHaveBeenCalledWith('valid-session');
    });
  });

  describe('DELETE /session/:id/insight', () => {
    it('should delete insight', async () => {
      mockInsightService.deleteInsight.mockResolvedValue({ success: true });

      const response = await request(app)
        .delete('/session/valid-session/insight')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockInsightService.deleteInsight).toHaveBeenCalledWith('valid-session');
    });
  });
});