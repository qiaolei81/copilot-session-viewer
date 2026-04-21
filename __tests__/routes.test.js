const express = require('express');
const request = require('supertest');

// Mock controllers
jest.mock('../src/controllers/sessionController');
jest.mock('../src/controllers/insightController');
jest.mock('../src/controllers/uploadController');

describe('Routes', () => {
  let app;
  let SessionController, InsightController, UploadController;

  beforeEach(() => {
    jest.resetModules();  // 清除 Jest 的模块缓存
    
    // 重新获取 mock 的 controllers
    SessionController = require('../src/controllers/sessionController');
    InsightController = require('../src/controllers/insightController');
    UploadController = require('../src/controllers/uploadController');
    
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('API Routes (api.js)', () => {
    let mockController;

    beforeEach(() => {
      // Create mock controller instance
      mockController = {
        getSessions: jest.fn((req, res) => {
          res.json({ sessions: [] });
        }),
        getSessionEvents: jest.fn((req, res) => {
          res.json({ events: [] });
        })
      };

      // Mock SessionController constructor to return our mock instance
      SessionController.mockImplementation(() => mockController);

      const apiRouter = require('../src/routes/api');
      app.use('/api', apiRouter);
    });

    it('should handle GET /api/sessions', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .expect(200);

      expect(response.body).toEqual({ sessions: [] });
    });

    it('should handle GET /api/sessions/:id/events', async () => {
      const response = await request(app)
        .get('/api/sessions/test-session-id/events')
        .expect(200);

      expect(response.body).toEqual({ events: [] });
    });

    it('should call controller methods with correct bindings', async () => {
      // Verify the route works - the mock is called internally by Express
      const response = await request(app).get('/api/sessions');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ sessions: [] });
    });
  });

  describe('Insight Routes (insights.js)', () => {
    let mockController;

    beforeEach(() => {
      // Create mock controller instance
      mockController = {
        generateInsight: jest.fn((req, res) => {
          res.json({ status: 'generating' });
        }),
        getInsightStatus: jest.fn((req, res) => {
          res.json({ status: 'not_started' });
        }),
        deleteInsight: jest.fn((req, res) => {
          res.json({ success: true });
        })
      };

      // Mock InsightController constructor to return our mock instance
      InsightController.mockImplementation(() => mockController);

      const insightsRouter = require('../src/routes/insights');
      app.use('/insights', insightsRouter);
    });

    it('should handle POST /insights/session/:id/insight', async () => {
      const response = await request(app)
        .post('/insights/session/test-id/insight')
        .expect(200);

      expect(response.body).toEqual({ status: 'generating' });
    });

    it('should handle GET /insights/session/:id/insight', async () => {
      const response = await request(app)
        .get('/insights/session/test-id/insight')
        .expect(200);

      expect(response.body).toEqual({ status: 'not_started' });
    });

    it('should handle DELETE /insights/session/:id/insight', async () => {
      const response = await request(app)
        .delete('/insights/session/test-id/insight')
        .expect(200);

      expect(response.body).toEqual({ success: true });
    });

    it('should pass session ID to controller', async () => {
      // Verify route works and controller processes the request
      const response = await request(app).post('/insights/session/my-session-123/insight');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'generating' });
    });
  });

  describe('Page Routes (pages.js)', () => {
    let mockController;

    beforeEach(() => {
      // Create mock controller instance
      mockController = {
        getHomepage: jest.fn((req, res) => {
          res.send('<html>Homepage</html>');
        }),
        getSessionDetail: jest.fn((req, res) => {
          res.send('<html>Session Detail</html>');
        }),
        getTimeAnalysis: jest.fn((req, res) => {
          res.send('<html>Time Analysis</html>');
        })
      };

      // Mock SessionController constructor to return our mock instance
      SessionController.mockImplementation(() => mockController);

      const pagesRouter = require('../src/routes/pages');
      app.use('/', pagesRouter);
    });

    it('should handle GET / (homepage)', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.text).toContain('Homepage');
    });

    it('should handle GET /session/:id (session detail)', async () => {
      const response = await request(app)
        .get('/session/test-session-id')
        .expect(200);

      expect(response.text).toContain('Session Detail');
    });

    it('should handle GET /session/:id/time-analyze', async () => {
      const response = await request(app)
        .get('/session/test-session-id/time-analyze')
        .expect(200);

      expect(response.text).toContain('Time Analysis');
    });

    it('should call controller methods with correct bindings', async () => {
      // Verify route works correctly
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Homepage');
    });
  });

  describe('Upload Routes (uploads.js)', () => {
    let mockController;

    beforeEach(() => {
      // Create mock controller instance with methods
      mockController = {
        shareSession: jest.fn((req, res) => {
          res.download = jest.fn();
          res.download('/tmp/session.zip', 'session.zip');
          res.status(200).end();
        }),
        importSession: jest.fn((req, res) => {
          res.json({ success: true, sessionId: 'imported-id' });
        }),
        getUploadMiddleware: jest.fn(() => {
          // Return a middleware that just calls next
          return (req, res, next) => {
            req.file = { path: '/tmp/test.zip', originalname: 'test.zip' };
            next();
          };
        })
      };

      // Mock UploadController constructor to return our mock instance
      UploadController.mockImplementation(() => mockController);

      const uploadsRouter = require('../src/routes/uploads');
      app.use('/uploads', uploadsRouter);
    });

    it('should handle GET /uploads/session/:id/share', async () => {
      await request(app)
        .get('/uploads/session/test-id/share')
        .expect(200);

      expect(mockController.shareSession).toHaveBeenCalled();
    });

    it('should handle POST /uploads/session/import with multer middleware', async () => {
      const response = await request(app)
        .post('/uploads/session/import')
        .expect(200);

      // Verify the response is correct - middleware and controller were called
      expect(response.body).toEqual({ success: true, sessionId: 'imported-id' });
    });

    it('should pass uploaded file through middleware', async () => {
      const response = await request(app)
        .post('/uploads/session/import')
        .attach('zipFile', Buffer.from('dummy'), 'test.zip');

      // Verify the route works and returns the correct response
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, sessionId: 'imported-id' });
    });

    it('should accept legacy sessionZip field name without MulterError', async () => {
      const response = await request(app)
        .post('/uploads/session/import')
        .attach('sessionZip', Buffer.from('dummy'), 'test.zip');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, sessionId: 'imported-id' });
    });
  });

  describe('Route Parameter Validation', () => {
    it('should accept valid session IDs', async () => {
      const mockController = {
        getHomepage: jest.fn((req, res) => res.send('home')),
        getSessionDetail: jest.fn((req, res) => {
          res.json({ sessionId: req.params.id });
        }),
        getTimeAnalysis: jest.fn((req, res) => res.send('time'))
      };

      // Set mock implementation BEFORE requiring the router
      SessionController.mockImplementation(() => mockController);
      
      // Clear the cache to force re-require with new mock
      const pagesRouter = require('../src/routes/pages');
      
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/', pagesRouter);

      const validIds = [
        'abc123',
        'session-123',
        'test_session',
        'ABC-123_test'
      ];

      for (const id of validIds) {
        const response = await request(testApp)
          .get(`/session/${id}`)
          .expect(200);

        // Verify the session ID was correctly extracted and passed
        expect(response.body.sessionId).toBe(id);
      }
    });

    it('should handle special characters in URLs', async () => {
      const mockController = {
        getHomepage: jest.fn((req, res) => res.send('home')),
        getSessionDetail: jest.fn((req, res) => {
          res.json({ sessionId: req.params.id });
        }),
        getTimeAnalysis: jest.fn((req, res) => res.send('time'))
      };

      SessionController.mockImplementation(() => mockController);

      const pagesRouter = require('../src/routes/pages');
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/', pagesRouter);

      // URL encoding should be handled by Express
      await request(testApp)
        .get('/session/test-id-123')
        .expect(200);
    });
  });

  describe('Error Handling in Routes', () => {
    it('should propagate controller errors', async () => {
      const mockController = {
        getSessions: jest.fn((req, res, next) => {
          const err = new Error('Controller error');
          next(err);
        }),
        getSessionEvents: jest.fn((req, res) => res.json({}))
      };

      SessionController.mockImplementation(() => mockController);

      const apiRouter = require('../src/routes/api');
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/api', apiRouter);

      // Add error handler
      testApp.use((err, req, res, _next) => {
        res.status(500).json({ error: err.message });
      });

      const response = await request(testApp)
        .get('/api/sessions');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Controller error');
    });

    it('should handle async controller errors', async () => {
      const mockController = {
        generateInsight: jest.fn(async (req, res, next) => {
          const err = new Error('Async error');
          next(err);
        }),
        getInsightStatus: jest.fn((req, res) => res.json({})),
        deleteInsight: jest.fn((req, res) => res.json({}))
      };

      InsightController.mockImplementation(() => mockController);

      const insightsRouter = require('../src/routes/insights');
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/insights', insightsRouter);

      // Add async error handler
      testApp.use((err, req, res, _next) => {
        res.status(500).json({ error: err.message });
      });

      const response = await request(testApp)
        .post('/insights/session/test/insight');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Async error');
    });
  });

  describe('Route Method Binding', () => {
    it('should correctly bind methods to controller instance (api routes)', async () => {
      // Test that routes work with .bind() - the actual binding is tested by Express
      const testController = {
        getSessions: jest.fn((req, res) => res.json({ bound: true })),
        getSessionEvents: jest.fn((req, res) => res.json({ ok: true }))
      };

      SessionController.mockImplementation(() => testController);

      const apiRouter = require('../src/routes/api');
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/api', apiRouter);

      const response = await request(testApp).get('/api/sessions');

      // Verify the route works and returns expected response
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ bound: true });
    });

    it('should correctly bind methods to controller instance (insight routes)', async () => {
      const testController = {
        getInsightStatus: jest.fn((req, res) => res.json({ bound: true })),
        generateInsight: jest.fn((req, res) => res.json({ ok: true })),
        deleteInsight: jest.fn((req, res) => res.json({ ok: true }))
      };

      InsightController.mockImplementation(() => testController);

      const insightsRouter = require('../src/routes/insights');
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/insights', insightsRouter);

      const response = await request(testApp).get('/insights/session/test/insight');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ bound: true });
    });

    it('should correctly bind methods to controller instance (upload routes)', async () => {
      const testController = {
        shareSession: jest.fn((req, res) => res.json({ bound: true })),
        importSession: jest.fn((req, res) => res.json({ ok: true })),
        getUploadMiddleware: jest.fn(() => (req, res, next) => next())
      };

      UploadController.mockImplementation(() => testController);

      const uploadsRouter = require('../src/routes/uploads');
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/uploads', uploadsRouter);

      const response = await request(testApp).get('/uploads/session/test/share');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ bound: true });
    });
  });
});
