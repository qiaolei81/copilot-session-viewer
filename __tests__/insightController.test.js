const InsightController = require('../src/controllers/insightController');

describe('InsightController - Additional Coverage', () => {
  let controller;
  let mockInsightService;
  let mockSessionService;
  let mockReq;
  let mockRes;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create mock insight service
    mockInsightService = {
      generateInsight: jest.fn(),
      getInsightStatus: jest.fn(),
      deleteInsight: jest.fn()
    };

    // Create mock session service
    mockSessionService = {
      getSessionById: jest.fn()
    };

    mockReq = {
      params: {},
      body: {},
      query: {}
    };

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should use provided insightService when passed', () => {
      controller = new InsightController(mockInsightService, mockSessionService);

      expect(controller.insightService).toBe(mockInsightService);
    });

    it('should create default insightService when not provided', () => {
      process.env.SESSION_DIR = '/custom/path';

      controller = new InsightController(null, mockSessionService);

      expect(controller.insightService).toBeDefined();
    });

    it('should use default SESSION_DIR when env var not set', () => {
      delete process.env.SESSION_DIR;

      controller = new InsightController(null, mockSessionService);

      expect(controller.insightService).toBeDefined();
      // The default path should be ~/.copilot/session-state
    });

    it('should handle undefined insightService parameter', () => {
      controller = new InsightController(undefined, mockSessionService);

      expect(controller.insightService).toBeDefined();
    });
  });

  describe('generateInsight', () => {
    beforeEach(() => {
      controller = new InsightController(mockInsightService, mockSessionService);
      
      // Mock session with all required fields
      mockSessionService.getSessionById.mockResolvedValue({
        id: 'valid-session-id',
        source: 'copilot',
        directory: '/path/to/session'
      });
    });

    it('should handle invalid session ID', async () => {
      mockReq.params.id = '../../../etc/passwd'; // Path traversal attempt

      await controller.generateInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid session ID' });
      expect(mockInsightService.generateInsight).not.toHaveBeenCalled();
    });

    it('should handle force regenerate flag set to true', async () => {
      mockReq.params.id = 'valid-session-id';
      mockReq.body = { force: true };
      mockInsightService.generateInsight.mockResolvedValue({ status: 'generating' });

      await controller.generateInsight(mockReq, mockRes);

      expect(mockInsightService.generateInsight).toHaveBeenCalledWith('valid-session-id', '/path/to/session', 'copilot', true);
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'generating' });
    });

    it('should handle force regenerate flag set to false', async () => {
      mockReq.params.id = 'valid-session-id';
      mockReq.body = { force: false };
      mockInsightService.generateInsight.mockResolvedValue({ status: 'completed' });

      await controller.generateInsight(mockReq, mockRes);

      expect(mockInsightService.generateInsight).toHaveBeenCalledWith('valid-session-id', '/path/to/session', 'copilot', false);
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'completed' });
    });

    it('should handle missing body (force = undefined)', async () => {
      mockReq.params.id = 'valid-session-id';
      mockReq.body = undefined;
      mockInsightService.generateInsight.mockResolvedValue({ status: 'completed' });

      await controller.generateInsight(mockReq, mockRes);

      expect(mockInsightService.generateInsight).toHaveBeenCalledWith('valid-session-id', '/path/to/session', 'copilot', false);
    });

    it('should handle missing force field in body', async () => {
      mockReq.params.id = 'valid-session-id';
      mockReq.body = { other: 'field' };
      mockInsightService.generateInsight.mockResolvedValue({ status: 'completed' });

      await controller.generateInsight(mockReq, mockRes);

      expect(mockInsightService.generateInsight).toHaveBeenCalledWith('valid-session-id', '/path/to/session', 'copilot', false);
    });

    it('should handle session not found', async () => {
      mockReq.params.id = 'nonexistent-session';
      mockSessionService.getSessionById.mockResolvedValue(null);

      await controller.generateInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Session not found' });
      expect(mockInsightService.generateInsight).not.toHaveBeenCalled();
    });

    it('should handle session without directory', async () => {
      mockReq.params.id = 'valid-session-id';
      mockSessionService.getSessionById.mockResolvedValue({
        id: 'valid-session-id',
        source: 'copilot',
        directory: null
      });

      await controller.generateInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Session directory not available' });
      expect(mockInsightService.generateInsight).not.toHaveBeenCalled();
    });

    it('should handle error with message', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'valid-session-id';
      const error = new Error('Insight generation failed');
      mockInsightService.generateInsight.mockRejectedValue(error);

      await controller.generateInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Insight generation failed' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error generating insight:', error);

      consoleErrorSpy.mockRestore();
    });

    it('should return 400 when events file is missing', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'valid-session-id';
      const error = new Error('Events file not found');
      mockInsightService.generateInsight.mockRejectedValue(error);

      await controller.generateInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Events file not found' });

      consoleErrorSpy.mockRestore();
    });

    it('should return 503 when insight generation lock cannot be acquired', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'valid-session-id';
      const error = new Error('Failed to acquire lock for insight generation');
      mockInsightService.generateInsight.mockRejectedValue(error);

      await controller.generateInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to acquire lock for insight generation' });

      consoleErrorSpy.mockRestore();
    });

    it('should handle error without message', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'valid-session-id';
      const error = new Error();
      error.message = '';
      mockInsightService.generateInsight.mockRejectedValue(error);

      await controller.generateInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error generating insight' });

      consoleErrorSpy.mockRestore();
    });

    it('should handle non-Error exceptions', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'valid-session-id';
      mockInsightService.generateInsight.mockRejectedValue('String error');

      await controller.generateInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error generating insight' });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getInsightStatus', () => {
    beforeEach(() => {
      controller = new InsightController(mockInsightService, mockSessionService);
      
      // Mock session with all required fields
      mockSessionService.getSessionById.mockResolvedValue({
        id: 'valid-session-id',
        source: 'copilot',
        directory: '/path/to/session'
      });
    });

    it('should handle invalid session ID', async () => {
      mockReq.params.id = '../../invalid';

      await controller.getInsightStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid session ID' });
      expect(mockInsightService.getInsightStatus).not.toHaveBeenCalled();
    });

    it('should return insight status for valid session', async () => {
      mockReq.params.id = 'valid-session-id';
      mockInsightService.getInsightStatus.mockResolvedValue({ status: 'completed', report: 'data' });

      await controller.getInsightStatus(mockReq, mockRes);

      expect(mockInsightService.getInsightStatus).toHaveBeenCalledWith('valid-session-id', '/path/to/session', 'copilot');
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'completed', report: 'data' });
    });

    it('should handle session not found', async () => {
      mockReq.params.id = 'nonexistent-session';
      mockSessionService.getSessionById.mockResolvedValue(null);

      await controller.getInsightStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Session not found' });
      expect(mockInsightService.getInsightStatus).not.toHaveBeenCalled();
    });

    it('should handle session without directory', async () => {
      mockReq.params.id = 'valid-session-id';
      mockSessionService.getSessionById.mockResolvedValue({
        id: 'valid-session-id',
        source: 'copilot',
        directory: null
      });

      await controller.getInsightStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Session directory not available' });
      expect(mockInsightService.getInsightStatus).not.toHaveBeenCalled();
    });

    it('should handle error when getting status', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'valid-session-id';
      mockInsightService.getInsightStatus.mockRejectedValue(new Error('Status error'));

      await controller.getInsightStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error getting insight status' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error getting insight status:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it('should handle different status values', async () => {
      const statuses = ['generating', 'completed', 'not_started', 'timeout'];

      for (const status of statuses) {
        mockReq.params.id = 'test-session';
        mockInsightService.getInsightStatus.mockResolvedValue({ status });

        await controller.getInsightStatus(mockReq, mockRes);

        expect(mockRes.json).toHaveBeenCalledWith({ status });
      }
    });
  });

  describe('deleteInsight', () => {
    beforeEach(() => {
      controller = new InsightController(mockInsightService, mockSessionService);
      
      // Mock session with all required fields
      mockSessionService.getSessionById.mockResolvedValue({
        id: 'valid-session-id',
        source: 'copilot',
        directory: '/path/to/session'
      });
    });

    it('should handle invalid session ID', async () => {
      mockReq.params.id = '../../invalid';

      await controller.deleteInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid session ID' });
      expect(mockInsightService.deleteInsight).not.toHaveBeenCalled();
    });

    it('should delete insight for valid session', async () => {
      mockReq.params.id = 'valid-session-id';
      mockInsightService.deleteInsight.mockResolvedValue({ success: true });

      await controller.deleteInsight(mockReq, mockRes);

      expect(mockInsightService.deleteInsight).toHaveBeenCalledWith('valid-session-id', '/path/to/session', 'copilot');
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('should handle session not found', async () => {
      mockReq.params.id = 'nonexistent-session';
      mockSessionService.getSessionById.mockResolvedValue(null);

      await controller.deleteInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Session not found' });
      expect(mockInsightService.deleteInsight).not.toHaveBeenCalled();
    });

    it('should handle session without directory', async () => {
      mockReq.params.id = 'valid-session-id';
      mockSessionService.getSessionById.mockResolvedValue({
        id: 'valid-session-id',
        source: 'copilot',
        directory: null
      });

      await controller.deleteInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Session directory not available' });
      expect(mockInsightService.deleteInsight).not.toHaveBeenCalled();
    });

    it('should handle error when deleting insight', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockReq.params.id = 'valid-session-id';
      mockInsightService.deleteInsight.mockRejectedValue(new Error('Delete error'));

      await controller.deleteInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Error deleting insight' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting insight:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it('should handle successful deletion', async () => {
      mockReq.params.id = 'session-to-delete';
      mockInsightService.deleteInsight.mockResolvedValue({
        success: true,
        message: 'Insight deleted'
      });

      await controller.deleteInsight(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Insight deleted'
      });
    });

    it('should handle deletion of non-existent insight', async () => {
      mockReq.params.id = 'nonexistent-session';
      mockInsightService.deleteInsight.mockResolvedValue({
        success: false,
        message: 'Insight not found'
      });

      await controller.deleteInsight(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Insight not found'
      });
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      controller = new InsightController(mockInsightService, mockSessionService);
    });

    it('should handle empty session ID', async () => {
      mockReq.params.id = '';

      await controller.generateInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid session ID' });
    });

    it('should handle very long session IDs', async () => {
      mockReq.params.id = 'a'.repeat(500);

      await controller.getInsightStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid session ID' });
    });

    it('should handle special characters in session ID', async () => {
      mockReq.params.id = 'session-with-$pecial-chars!';

      await controller.deleteInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid session ID' });
    });

    it('should handle null session ID', async () => {
      mockReq.params.id = null;

      await controller.generateInsight(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid session ID' });
    });

    it('should handle undefined session ID', async () => {
      mockReq.params.id = undefined;

      await controller.getInsightStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid session ID' });
    });
  });

  describe('Integration Scenarios', () => {
    beforeEach(() => {
      controller = new InsightController(mockInsightService, mockSessionService);
      
      // Mock session for integration tests
      mockSessionService.getSessionById.mockResolvedValue({
        id: 'lifecycle-session',
        source: 'copilot',
        directory: '/path/to/session'
      });
    });

    it('should handle complete insight lifecycle', async () => {
      const sessionId = 'lifecycle-session';

      // Generate insight
      mockReq.params.id = sessionId;
      mockReq.body = { force: false };
      mockInsightService.generateInsight.mockResolvedValue({ status: 'generating' });
      await controller.generateInsight(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'generating' });

      // Check status
      mockInsightService.getInsightStatus.mockResolvedValue({ status: 'completed', report: 'Report content' });
      await controller.getInsightStatus(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'completed', report: 'Report content' });

      // Delete insight
      mockInsightService.deleteInsight.mockResolvedValue({ success: true });
      await controller.deleteInsight(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('should handle force regeneration workflow', async () => {
      const sessionId = 'regen-session';
      mockReq.params.id = sessionId;
      
      // Update mock for this specific session
      mockSessionService.getSessionById.mockResolvedValue({
        id: sessionId,
        source: 'copilot',
        directory: '/path/to/regen-session'
      });

      // Initial generation
      mockReq.body = { force: false };
      mockInsightService.generateInsight.mockResolvedValue({ status: 'completed', report: 'Old report' });
      await controller.generateInsight(mockReq, mockRes);

      // Force regeneration
      mockReq.body = { force: true };
      mockInsightService.generateInsight.mockResolvedValue({ status: 'generating' });
      await controller.generateInsight(mockReq, mockRes);

      expect(mockInsightService.generateInsight).toHaveBeenCalledWith(sessionId, '/path/to/regen-session', 'copilot', true);
    });
  });
});
