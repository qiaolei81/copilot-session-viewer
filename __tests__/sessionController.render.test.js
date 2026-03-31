const SessionController = require('../src/controllers/sessionController');

describe('SessionController - Rendering Coverage', () => {
  let controller;
  let mockSessionService;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockSessionService = {
      getSessionEvents: jest.fn().mockResolvedValue([]),
      _extractUsageData: jest.fn().mockReturnValue(null),
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

    it('should render Claude usage metadata when extracted from session events', async () => {
      mockReq.params.id = 'claude-usage-session';

      const mockSession = {
        id: 'claude-usage-session',
        source: 'claude',
        created: '2024-01-01',
        summary: 'Claude usage session'
      };

      mockSessionService.sessionRepository.findById.mockResolvedValue(mockSession);
      mockSessionService.getSessionEvents = jest.fn().mockResolvedValue([
        {
          type: 'assistant.message',
          model: 'claude-opus-4.6',
          usage: {
            input_tokens: 120,
            cache_read_input_tokens: 30,
            output_tokens: 45
          }
        }
      ]);
      mockSessionService._extractUsageData = jest.fn().mockReturnValue({
        modelMetrics: {
          'claude-opus-4.6': {
            requests: { count: 1 },
            usage: {
              inputTokens: 150,
              outputTokens: 45,
              cacheReadTokens: 30,
              cacheWriteTokens: 0
            }
          }
        },
        totalPremiumRequests: 0,
        totalApiDurationMs: 0,
        codeChanges: { linesAdded: 0, linesRemoved: 0, filesModified: [] },
        currentTokens: 0,
        systemTokens: 0,
        conversationTokens: 0,
        toolDefinitionsTokens: 0
      });

      await controller.getSessionDetail(mockReq, mockRes);

      expect(mockSessionService.getSessionEvents).toHaveBeenCalledWith('claude-usage-session');
      expect(mockSessionService._extractUsageData).toHaveBeenCalledWith([
        {
          type: 'assistant.message',
          model: 'claude-opus-4.6',
          usage: {
            input_tokens: 120,
            cache_read_input_tokens: 30,
            output_tokens: 45
          }
        }
      ]);
      expect(mockRes.render).toHaveBeenCalledWith('session-vue',
        expect.objectContaining({
          sessionId: 'claude-usage-session',
          events: [],
          metadata: expect.objectContaining({
            source: 'claude',
            usage: expect.objectContaining({
              modelMetrics: expect.objectContaining({
                'claude-opus-4.6': expect.objectContaining({
                  requests: { count: 1 }
                })
              })
            })
          })
        })
      );
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
