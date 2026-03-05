const SessionController = require('../src/controllers/sessionController');

describe('SessionController - Additional Coverage', () => {
  let controller;
  let mockSessionService;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    // Create mock session service
    mockSessionService = {
      getPaginatedSessions: jest.fn(),
      getAllSessions: jest.fn(),
      getSessionWithEvents: jest.fn(),
      getSessionById: jest.fn(),
      getSessionEvents: jest.fn(),
      getTimeline: jest.fn(),
      sessionRepository: {
        findById: jest.fn(),
        sources: []
      }
    };

    controller = new SessionController(mockSessionService);

    // Create mock request and response
    mockReq = {
      params: {},
      query: {},
      headers: {}
    };

    mockRes = {
      render: jest.fn(),
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      set: jest.fn(),
      setHeader: jest.fn(),
      end: jest.fn()
    };
  });

  describe('getHomepage', () => {
    it('should handle error when loading sessions fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSessionService.getPaginatedSessions.mockRejectedValue(new Error('Database error'));

      await controller.getHomepage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('Error loading sessions');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error loading sessions:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getSessionDetail', () => {
    it('should handle error when loading session fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'valid-session-id';
      // Mock findById to reject - this is what the actual implementation calls
      mockSessionService.sessionRepository.findById.mockRejectedValue(new Error('Read error'));

      await controller.getSessionDetail(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error loading session' });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getTimeAnalysis', () => {
    it('should handle error when loading time analysis fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'valid-session-id';
      // Mock findById to reject - this is what the actual implementation calls
      mockSessionService.sessionRepository.findById.mockRejectedValue(new Error('Analysis error'));

      await controller.getTimeAnalysis(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error loading analysis' });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getSessions - with pagination', () => {
    it('should return error for page < 1 (with negative page)', async () => {
      mockReq.query.page = '-1';
      mockReq.query.limit = '20';

      await controller.getSessions(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid pagination parameters' });
    });

    it('should return error for limit < 1 (with negative limit)', async () => {
      mockReq.query.page = '1';
      mockReq.query.limit = '-1';

      await controller.getSessions(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid pagination parameters' });
    });

    it('should return error for limit > 100', async () => {
      mockReq.query.page = '1';
      mockReq.query.limit = '101';

      await controller.getSessions(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid pagination parameters' });
    });

    it('should set cache headers for paginated data', async () => {
      mockReq.query.page = '2';
      mockReq.query.limit = '50';
      mockSessionService.getPaginatedSessions.mockResolvedValue({
        sessions: [],
        hasNextPage: false,
        totalSessions: 50
      });

      await controller.getSessions(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith({
        'Cache-Control': 'public, max-age=60'
      });
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should handle error when getting paginated sessions', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.query.page = '1';
      mockReq.query.limit = '20';
      mockSessionService.getPaginatedSessions.mockRejectedValue(new Error('DB error'));

      await controller.getSessions(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error loading sessions' });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getSessions - without pagination', () => {
    it('should set cache headers for full session list', async () => {
      mockSessionService.getAllSessions.mockResolvedValue([]);

      await controller.getSessions(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith({
        'Cache-Control': 'public, max-age=300'
      });
      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('loadMoreSessions', () => {
    it('should return error for offset < 0', async () => {
      mockReq.query.offset = '-1';
      mockReq.query.limit = '20';

      await controller.loadMoreSessions(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid parameters' });
    });

    it('should return error for limit < 1 (with negative limit)', async () => {
      mockReq.query.offset = '0';
      mockReq.query.limit = '-1';

      await controller.loadMoreSessions(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid parameters' });
    });

    it('should return error for limit > 50', async () => {
      mockReq.query.offset = '0';
      mockReq.query.limit = '51';

      await controller.loadMoreSessions(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid parameters' });
    });

    it('should handle error when loading more sessions', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.query.offset = '20';
      mockReq.query.limit = '20';
      mockSessionService.getPaginatedSessions.mockRejectedValue(new Error('Load error'));

      await controller.loadMoreSessions(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error loading more sessions' });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getSessionEvents - pagination', () => {
    it('should return error for limit < 1 (with negative limit)', async () => {
      mockReq.params.id = 'valid-session-id';
      mockReq.query.limit = '-1';
      mockSessionService.sessionRepository.findById.mockResolvedValue({ id: 'valid-session-id', updatedAt: '2024-01-01' });

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Limit must be between 1 and 1000' });
    });

    it('should return error for limit > 1000', async () => {
      mockReq.params.id = 'valid-session-id';
      mockReq.query.limit = '1001';
      mockSessionService.sessionRepository.findById.mockResolvedValue({ id: 'valid-session-id', updatedAt: '2024-01-01' });

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Limit must be between 1 and 1000' });
    });

    it('should return error for offset < 0', async () => {
      mockReq.params.id = 'valid-session-id';
      mockReq.query.limit = '100';
      mockReq.query.offset = '-1';
      mockSessionService.sessionRepository.findById.mockResolvedValue({ id: 'valid-session-id', updatedAt: '2024-01-01' });

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Offset must be non-negative' });
    });

    it('should return 304 when ETag matches', async () => {
      mockReq.params.id = 'test-session';
      mockReq.headers['if-none-match'] = 'matching-etag';
      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'test-session',
        updatedAt: '2024-01-01'
      });

      // Mock crypto to return predictable hash
      const crypto = require('crypto');
      jest.spyOn(crypto, 'createHash').mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('matching-etag')
      });

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(304);
      expect(mockRes.end).toHaveBeenCalled();

      crypto.createHash.mockRestore();
    });

    it('should return paginated events with correct structure', async () => {
      mockReq.params.id = 'test-session';
      mockReq.query.limit = '50';
      mockReq.query.offset = '10';
      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'test-session',
        updatedAt: '2024-01-01'
      });
      mockSessionService.getSessionEvents.mockResolvedValue({
        events: [{ id: 1 }, { id: 2 }],
        total: 100
      });

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        events: [{ id: 1 }, { id: 2 }],
        pagination: {
          total: 100,
          limit: 50,
          offset: 10,
          hasMore: true
        }
      });
    });

    it('should set hasMore to false when at end', async () => {
      mockReq.params.id = 'test-session';
      mockReq.query.limit = '50';
      mockReq.query.offset = '80';
      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'test-session',
        updatedAt: '2024-01-01'
      });
      mockSessionService.getSessionEvents.mockResolvedValue({
        events: [{ id: 1 }],
        total: 100
      });

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        events: [{ id: 1 }],
        pagination: {
          total: 100,
          limit: 50,
          offset: 80,
          hasMore: false
        }
      });
    });

    it('should handle error when loading events', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'valid-session-id';
      mockSessionService.sessionRepository.findById.mockRejectedValue(new Error('DB error'));

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error loading events' });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getTimeline', () => {
    it('should handle error when loading timeline', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'valid-session-id';
      mockSessionService.getSessionById.mockResolvedValue({ id: 'valid-session-id' });
      mockSessionService.getTimeline.mockRejectedValue(new Error('Timeline error'));

      await controller.getTimeline(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error loading timeline' });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('exportSession - Copilot source', () => {
    beforeEach(() => {
      mockSessionService.sessionRepository.sources = [
        { type: 'copilot', dir: '/mock/copilot' }
      ];
    });

    it('should return 404 if copilot source not found', async () => {
      mockReq.params.id = 'session-123';
      mockSessionService.sessionRepository.sources = []; // No copilot source
      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'session-123',
        source: 'copilot'
      });

      await controller.exportSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Copilot source not found' });
    });

    it('should handle error during export', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'error-session';
      mockSessionService.sessionRepository.findById.mockRejectedValue(new Error('Export error'));

      await controller.exportSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error exporting session' });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('exportSession - Claude source', () => {
    beforeEach(() => {
      mockSessionService.sessionRepository.sources = [
        { type: 'claude', dir: '/mock/claude' }
      ];
    });

    it('should return 404 if claude session file not found in any project', async () => {
      const fs = require('fs');

      mockReq.params.id = 'missing-claude-session';
      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'missing-claude-session',
        source: 'claude'
      });

      jest.spyOn(fs.promises, 'readdir').mockResolvedValue(['project1']);
      jest.spyOn(fs.promises, 'access').mockRejectedValue(new Error('ENOENT'));

      await controller.exportSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Session file not found' });

      fs.promises.readdir.mockRestore();
      fs.promises.access.mockRestore();
    });

    it('should return 404 if claude source not found', async () => {
      mockReq.params.id = 'session-456';
      mockSessionService.sessionRepository.sources = []; // No claude source
      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'session-456',
        source: 'claude'
      });

      await controller.exportSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Claude source not found' });
    });
  });

  describe('exportSession - Pi-Mono source', () => {
    beforeEach(() => {
      mockSessionService.sessionRepository.sources = [
        { type: 'pi-mono', dir: '/mock/pi-mono' }
      ];
    });

    it('should return 404 if pi-mono session file not found', async () => {
      const fs = require('fs');

      mockReq.params.id = 'missing-pi-session';
      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'missing-pi-session',
        source: 'pi-mono'
      });

      jest.spyOn(fs.promises, 'readdir').mockResolvedValue(['other-file.jsonl']);

      await controller.exportSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Session file not found' });

      fs.promises.readdir.mockRestore();
    });

    it('should return 404 if pi-mono source not found', async () => {
      mockReq.params.id = 'session-789';
      mockSessionService.sessionRepository.sources = []; // No pi-mono source
      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'session-789',
        source: 'pi-mono'
      });

      await controller.exportSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Pi-Mono source not found' });
    });
  });

  describe('exportSession - path not accessible', () => {
    it('should return 404 if session path is not accessible', async () => {
      const fs = require('fs');

      mockReq.params.id = 'inaccessible-session';
      mockSessionService.sessionRepository.sources = [
        { type: 'copilot', dir: '/mock/copilot' }
      ];
      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'inaccessible-session',
        source: 'copilot'
      });

      jest.spyOn(fs.promises, 'stat').mockRejectedValue(new Error('ENOENT'));
      jest.spyOn(fs.promises, 'access').mockRejectedValue(new Error('EACCES'));

      await controller.exportSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Session file not accessible' });

      fs.promises.stat.mockRestore();
      fs.promises.access.mockRestore();
    });
  });

  describe('exportSession - unknown source', () => {
    it('should return 404 for unknown source type', async () => {
      mockReq.params.id = 'unknown-session';
      mockSessionService.sessionRepository.sources = [];
      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'unknown-session',
        source: 'unknown-type'
      });

      await controller.exportSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Session file not found' });
    });
  });
});
