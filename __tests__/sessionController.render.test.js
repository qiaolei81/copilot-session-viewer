const SessionController = require('../src/controllers/sessionController');

describe('SessionController - Rendering Coverage', () => {
  let controller;
  let mockSessionService;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockSessionService = {
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
      render: jest.fn(),
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getSessionDetail - render path', () => {
    it('should render session-vue template with sessionId, events, and metadata', async () => {
      mockReq.params.id = 'render-test-session';

      const mockSession = {
        id: 'render-test-session',
        source: 'copilot',
        created: '2024-01-01',
        summary: 'Test session'
      };

      mockSessionService.sessionRepository.findById.mockResolvedValue(mockSession);

      await controller.getSessionDetail(mockReq, mockRes);

      expect(mockRes.render).toHaveBeenCalledWith('session-vue',
        expect.objectContaining({
          sessionId: 'render-test-session',
          events: [],
          metadata: expect.objectContaining({
            source: 'copilot',
            summary: 'Test session'
          })
        })
      );
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('getTimeAnalysis - render path', () => {
    it('should render time-analyze template with sessionId, events, and metadata', async () => {
      mockReq.params.id = 'time-analyze-session';

      const mockSession = {
        id: 'time-analyze-session',
        source: 'claude',
        created: '2024-01-15',
        summary: 'Time analysis test'
      };

      mockSessionService.sessionRepository.findById.mockResolvedValue(mockSession);

      await controller.getTimeAnalysis(mockReq, mockRes);

      expect(mockRes.render).toHaveBeenCalledWith('time-analyze',
        expect.objectContaining({
          sessionId: 'time-analyze-session',
          events: [],
          metadata: expect.objectContaining({
            source: 'claude',
            summary: 'Time analysis test'
          })
        })
      );
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should handle time analysis for pi-mono sessions', async () => {
      mockReq.params.id = 'pi-mono-time-session';

      const mockSession = {
        id: 'pi-mono-time-session',
        source: 'pi-mono',
        created: '2024-02-01'
      };

      mockSessionService.sessionRepository.findById.mockResolvedValue(mockSession);

      await controller.getTimeAnalysis(mockReq, mockRes);

      expect(mockRes.render).toHaveBeenCalledWith('time-analyze',
        expect.objectContaining({
          sessionId: 'pi-mono-time-session',
          events: [],
          metadata: expect.objectContaining({
            source: 'pi-mono'
          })
        })
      );
    });
  });

  describe('getSessionDetail - edge cases', () => {
    it('should handle session with empty events array', async () => {
      mockReq.params.id = 'empty-events-session';

      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'empty-events-session'
      });

      await controller.getSessionDetail(mockReq, mockRes);

      expect(mockRes.render).toHaveBeenCalledWith('session-vue',
        expect.objectContaining({
          sessionId: 'empty-events-session',
          events: [],
          metadata: expect.any(Object)
        })
      );
    });

    it('should handle session with large events array', async () => {
      mockReq.params.id = 'large-session';

      mockSessionService.sessionRepository.findById.mockResolvedValue({
        id: 'large-session'
      });

      await controller.getSessionDetail(mockReq, mockRes);

      expect(mockRes.render).toHaveBeenCalledWith('session-vue',
        expect.objectContaining({
          sessionId: 'large-session',
          events: [],
          metadata: expect.any(Object)
        })
      );
    });
  });
});
