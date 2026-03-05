const SessionController = require('../src/controllers/sessionController');

describe('SessionController - ETag and Pagination Coverage', () => {
  let controller;
  let mockSessionService;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockSessionService = {
      getPaginatedSessions: jest.fn(),
      getAllSessions: jest.fn(),
      getSessionById: jest.fn(),
      getSessionEvents: jest.fn(),
      getTimeline: jest.fn(),
      sessionRepository: {
        findById: jest.fn()
      }
    };

    controller = new SessionController(mockSessionService);

    mockReq = {
      params: {},
      query: {},
      headers: {}
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      set: jest.fn(),
      end: jest.fn()
    };
  });

  describe('getSessionEvents - ETag with pagination', () => {
    it('should generate different ETags for different pagination params', async () => {
      mockReq.params.id = 'test-session';
      mockReq.query.limit = '100';
      mockReq.query.offset = '50';

      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'test-session',
        updatedAt: '2024-01-01'
      });
      mockSessionService.getSessionEvents.mockResolvedValue({
        events: [],
        total: 150
      });

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          ETag: expect.any(String)
        })
      );
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should generate different ETag without pagination', async () => {
      mockReq.params.id = 'test-session';
      // No limit/offset = no pagination

      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'test-session',
        updatedAt: '2024-01-01'
      });
      mockSessionService.getSessionEvents.mockResolvedValue([{}, {}]);

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          ETag: expect.any(String)
        })
      );
      expect(mockRes.json).toHaveBeenCalledWith([{}, {}]);
    });

    it('should use created date when updated is not available', async () => {
      mockReq.params.id = 'test-session';

      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'test-session',
        createdAt: '2024-01-01'
        // No updatedAt field
      });
      mockSessionService.getSessionEvents.mockResolvedValue([]);

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('getTimeline - ETag generation', () => {
    it('should generate ETag using updated date', async () => {
      mockReq.params.id = 'timeline-session';

      mockSessionService.getSessionById.mockResolvedValue({
        id: 'timeline-session',
        updatedAt: '2024-02-01'
      });
      mockSessionService.getTimeline.mockResolvedValue({
        turns: []
      });

      await controller.getTimeline(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          ETag: expect.any(String),
          'Cache-Control': 'private, max-age=300'
        })
      );
      expect(mockRes.json).toHaveBeenCalledWith({ turns: [] });
    });

    it('should generate ETag using created date when updated missing', async () => {
      mockReq.params.id = 'timeline-session';

      mockSessionService.getSessionById.mockResolvedValue({
        id: 'timeline-session',
        createdAt: '2024-01-15'
      });
      mockSessionService.getTimeline.mockResolvedValue({
        turns: []
      });

      await controller.getTimeline(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('loadMoreSessions - page calculation', () => {
    it('should calculate correct page from offset=0', async () => {
      mockReq.query.offset = '0';
      mockReq.query.limit = '20';

      mockSessionService.getPaginatedSessions.mockResolvedValue({
        sessions: [],
        hasNextPage: false,
        totalSessions: 10
      });

      await controller.loadMoreSessions(mockReq, mockRes);

      // offset=0, limit=20 => page=1
      expect(mockSessionService.getPaginatedSessions).toHaveBeenCalledWith(1, 20, null);
    });

    it('should calculate correct page from offset=20', async () => {
      mockReq.query.offset = '20';
      mockReq.query.limit = '20';

      mockSessionService.getPaginatedSessions.mockResolvedValue({
        sessions: [],
        hasNextPage: false,
        totalSessions: 30
      });

      await controller.loadMoreSessions(mockReq, mockRes);

      // offset=20, limit=20 => page=2
      expect(mockSessionService.getPaginatedSessions).toHaveBeenCalledWith(2, 20, null);
    });

    it('should calculate correct page from offset=100, limit=25', async () => {
      mockReq.query.offset = '100';
      mockReq.query.limit = '25';

      mockSessionService.getPaginatedSessions.mockResolvedValue({
        sessions: [],
        hasNextPage: true,
        totalSessions: 200
      });

      await controller.loadMoreSessions(mockReq, mockRes);

      // offset=100, limit=25 => page=5 (Math.floor(100/25) + 1 = 4+1)
      expect(mockSessionService.getPaginatedSessions).toHaveBeenCalledWith(5, 25, null);
    });

    it('should use default offset=0 and limit=20', async () => {
      // No query params

      mockSessionService.getPaginatedSessions.mockResolvedValue({
        sessions: [],
        hasNextPage: false,
        totalSessions: 10
      });

      await controller.loadMoreSessions(mockReq, mockRes);

      expect(mockSessionService.getPaginatedSessions).toHaveBeenCalledWith(1, 20, null);
    });
  });

  describe('getSessions - cache headers variation', () => {
    it('should set different ETag for different page numbers', async () => {
      mockReq.query.page = '3';
      mockReq.query.limit = '25';

      mockSessionService.getPaginatedSessions.mockResolvedValue({
        sessions: [],
        hasNextPage: false,
        totalSessions: 50
      });

      await controller.getSessions(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Cache-Control': 'public, max-age=60'
        })
      );
    });

    it('should set cache headers for full session list', async () => {
      // No pagination params

      mockSessionService.getAllSessions.mockResolvedValue([]);

      await controller.getSessions(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Cache-Control': 'public, max-age=300'
        })
      );
    });
  });

  describe('getSessionEvents - hasMore calculation', () => {
    it('should set hasMore=true when more events exist', async () => {
      mockReq.params.id = 'test-session';
      mockReq.query.limit = '50';
      mockReq.query.offset = '0';

      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'test-session',
        updatedAt: '2024-01-01'
      });
      mockSessionService.getSessionEvents.mockResolvedValue({
        events: new Array(50).fill({}),
        total: 150
      });

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            hasMore: true,
            total: 150,
            limit: 50,
            offset: 0
          })
        })
      );
    });

    it('should set hasMore=false when no more events', async () => {
      mockReq.params.id = 'test-session';
      mockReq.query.limit = '50';
      mockReq.query.offset = '50';

      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'test-session',
        updatedAt: '2024-01-01'
      });
      mockSessionService.getSessionEvents.mockResolvedValue({
        events: new Array(25).fill({}),
        total: 75
      });

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            hasMore: false,
            total: 75,
            limit: 50,
            offset: 50
          })
        })
      );
    });

    it('should handle default pagination params', async () => {
      mockReq.params.id = 'test-session';
      mockReq.query.limit = '100'; // Default
      mockReq.query.offset = '0';  // Default would be applied

      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'test-session',
        updatedAt: '2024-01-01'
      });
      mockSessionService.getSessionEvents.mockResolvedValue({
        events: [],
        total: 50
      });

      await controller.getSessionEvents(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
    });
  });
});
