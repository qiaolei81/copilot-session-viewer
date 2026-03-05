const SessionController = require('../src/controllers/sessionController');

describe('SessionController - Homepage Coverage', () => {
  let controller;
  let mockSessionService;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockSessionService = {
      getPaginatedSessions: jest.fn()
    };

    controller = new SessionController(mockSessionService);

    mockReq = {
      params: {},
      query: {},
      headers: {}
    };

    mockRes = {
      render: jest.fn(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getHomepage - render success path', () => {
    it('should render index template with sessions data', async () => {
      const mockSessions = [
        { id: 'session-1', summary: 'First session' },
        { id: 'session-2', summary: 'Second session' }
      ];

      mockSessionService.getPaginatedSessions.mockResolvedValue({
        sessions: mockSessions,
        hasNextPage: true,
        totalSessions: 150
      });

      await controller.getHomepage(mockReq, mockRes);

      expect(mockSessionService.getPaginatedSessions).toHaveBeenCalledWith(1, 20, 'copilot');
      expect(mockRes.render).toHaveBeenCalledWith('index', {
        sessions: mockSessions,
        hasMore: true,
        totalSessions: 150
      });
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should render homepage with no more sessions', async () => {
      const mockSessions = [{ id: 'session-1' }];

      mockSessionService.getPaginatedSessions.mockResolvedValue({
        sessions: mockSessions,
        hasNextPage: false,
        totalSessions: 1
      });

      await controller.getHomepage(mockReq, mockRes);

      expect(mockRes.render).toHaveBeenCalledWith('index', {
        sessions: mockSessions,
        hasMore: false,
        totalSessions: 1
      });
    });

    it('should render homepage with empty sessions array', async () => {
      mockSessionService.getPaginatedSessions.mockResolvedValue({
        sessions: [],
        hasNextPage: false,
        totalSessions: 0
      });

      await controller.getHomepage(mockReq, mockRes);

      expect(mockRes.render).toHaveBeenCalledWith('index', {
        sessions: [],
        hasMore: false,
        totalSessions: 0
      });
    });

    it('should render homepage with exactly 100 sessions', async () => {
      const mockSessions = new Array(100).fill(null).map((_, i) => ({
        id: `session-${i}`,
        summary: `Session ${i}`
      }));

      mockSessionService.getPaginatedSessions.mockResolvedValue({
        sessions: mockSessions,
        hasNextPage: true,
        totalSessions: 200
      });

      await controller.getHomepage(mockReq, mockRes);

      expect(mockRes.render).toHaveBeenCalledWith('index', {
        sessions: mockSessions,
        hasMore: true,
        totalSessions: 200
      });
    });
  });
});
