const SessionRepository = require('../src/services/sessionRepository');
const Session = require('../src/models/Session');
const fs = require('fs').promises;

// Mock the fileUtils module
jest.mock('../src/utils/fileUtils');
const fileUtils = require('../src/utils/fileUtils');

describe('SessionRepository', () => {
  let sessionRepository;
  let mockSessionDir;

  beforeEach(() => {
    mockSessionDir = '/mock/session/dir';
    sessionRepository = new SessionRepository(mockSessionDir);

    // Reset all mocks
    jest.resetAllMocks();

    // Mock fs.readdir
    jest.spyOn(fs, 'readdir').mockResolvedValue([]);
    jest.spyOn(fs, 'stat').mockResolvedValue({
      isDirectory: jest.fn().mockReturnValue(true),
      isFile: jest.fn().mockReturnValue(false),
      birthtime: new Date('2026-02-15T10:00:00Z'),
      mtime: new Date('2026-02-15T12:00:00Z')
    });

    // Mock fileUtils functions
    fileUtils.shouldSkipEntry.mockReturnValue(false);
    fileUtils.fileExists.mockResolvedValue(true);
    fileUtils.parseYAML.mockResolvedValue({
      summary: 'Test session',
      created_at: '2026-02-15T10:00:00Z',
      updated_at: '2026-02-15T12:00:00Z'
    });
    fileUtils.countLines.mockResolvedValue(50);
    fileUtils.getSessionDuration.mockResolvedValue(300000); // 5 minutes
    fileUtils.getSessionMetadata.mockResolvedValue({
      copilotVersion: '1.0.0',
      selectedModel: 'claude-3-sonnet'
    });
    fileUtils.getSessionMetadataOptimized.mockResolvedValue({
      duration: 300000,
      copilotVersion: '1.0.0',
      selectedModel: 'claude-3-sonnet',
      firstUserMessage: 'Test message'
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('findAll', () => {
    it('should return empty array when no sessions exist', async () => {
      jest.spyOn(fs, 'readdir').mockResolvedValue([]);

      const sessions = await sessionRepository.findAll();

      expect(sessions).toEqual([]);
    });

    it('should return sessions sorted by updatedAt (newest first)', async () => {
      const mockEntries = ['session1', 'session2'];
      const mockReaddir = jest.spyOn(fs, 'readdir').mockResolvedValue(mockEntries);

      const mockStats1 = {
        isDirectory: () => true,
        isFile: () => false,
        birthtime: new Date('2026-02-15T10:00:00Z'),
        mtime: new Date('2026-02-15T11:00:00Z')
      };

      const mockStats2 = {
        isDirectory: () => true,
        isFile: () => false,
        birthtime: new Date('2026-02-15T09:00:00Z'),
        mtime: new Date('2026-02-15T12:00:00Z') // Newer
      };

      jest.spyOn(fs, 'stat')
        .mockResolvedValueOnce(mockStats1)
        .mockResolvedValueOnce(mockStats2);

      // Reset and setup fileUtils mocks specifically for this test
      fileUtils.shouldSkipEntry.mockReturnValue(false);
      fileUtils.parseYAML
        .mockResolvedValueOnce({
          summary: 'Session 1',
          created_at: '2026-02-15T10:00:00Z',
          updated_at: '2026-02-15T11:00:00Z'
        })
        .mockResolvedValueOnce({
          summary: 'Session 2',
          created_at: '2026-02-15T09:00:00Z',
          updated_at: '2026-02-15T12:00:00Z'
        });

      const sessions = await sessionRepository.findAll();

      expect(mockReaddir).toHaveBeenCalledWith(mockSessionDir);
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('session2'); // Newer should be first
      expect(sessions[1].id).toBe('session1');
    });

    it('should skip entries that should be skipped', async () => {
      const mockEntries = ['valid-session', '.hidden-file', 'node_modules'];
      jest.spyOn(fs, 'readdir').mockResolvedValue(mockEntries);

      fileUtils.shouldSkipEntry
        .mockReturnValueOnce(false) // valid-session
        .mockReturnValueOnce(true)  // .hidden-file
        .mockReturnValueOnce(true); // node_modules

      // Mock stat for the valid session
      jest.spyOn(fs, 'stat').mockResolvedValueOnce({
        isDirectory: () => true,
        isFile: () => false,
        birthtime: new Date('2026-02-15T10:00:00Z'),
        mtime: new Date('2026-02-15T11:00:00Z')
      });

      const sessions = await sessionRepository.findAll();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('valid-session');
    });

    it('should handle directory processing errors gracefully', async () => {
      const mockEntries = ['valid-session', 'error-session'];
      jest.spyOn(fs, 'readdir').mockResolvedValue(mockEntries);

      jest.spyOn(fs, 'stat')
        .mockResolvedValueOnce({
          isDirectory: () => true,
          isFile: () => false,
          birthtime: new Date(),
          mtime: new Date()
        })
        .mockRejectedValueOnce(new Error('Permission denied'));

      const sessions = await sessionRepository.findAll();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('valid-session');
    });

    it('should handle .jsonl files', async () => {
      const mockEntries = ['session.jsonl'];
      jest.spyOn(fs, 'readdir').mockResolvedValue(mockEntries);

      jest.spyOn(fs, 'stat').mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        birthtime: new Date('2026-02-15T10:00:00Z'),
        mtime: new Date('2026-02-15T12:00:00Z')
      });

      fileUtils.getFirstUserMessage.mockResolvedValue('User message');
      fileUtils.getSessionDuration.mockResolvedValue(180000);
      fileUtils.getSessionMetadata.mockResolvedValue({
        copilotVersion: '1.0.0',
        selectedModel: 'claude-3-sonnet'
      });
      fileUtils.getSessionMetadataOptimized.mockResolvedValue({
        duration: 180000,
        copilotVersion: '1.0.0',
        selectedModel: 'claude-3-sonnet',
        firstUserMessage: 'User message'
      });

      const sessions = await sessionRepository.findAll();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('session');
      expect(sessions[0].type).toBe('file');
      expect(sessions[0].summary).toBe('User message');
    });

    it('should handle fs.readdir errors', async () => {
      jest.spyOn(fs, 'readdir').mockRejectedValue(new Error('Directory not found'));

      const sessions = await sessionRepository.findAll();

      expect(sessions).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should find session by id (directory)', async () => {
      const sessionId = 'test-session';

      jest.spyOn(fs, 'stat').mockResolvedValueOnce({
        isDirectory: () => true,
        birthtime: new Date('2026-02-15T10:00:00Z'),
        mtime: new Date('2026-02-15T12:00:00Z')
      });

      const session = await sessionRepository.findById(sessionId);

      expect(session).toBeInstanceOf(Session);
      expect(session.id).toBe(sessionId);
      expect(session.type).toBe('directory');
    });

    it('should find session by id (.jsonl file)', async () => {
      const sessionId = 'test-session';

      // First stat call fails (no directory)
      jest.spyOn(fs, 'stat')
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({
          isFile: () => true,
          birthtime: new Date('2026-02-15T10:00:00Z'),
          mtime: new Date('2026-02-15T12:00:00Z')
        });

      fileUtils.countLines.mockResolvedValue(25);
      fileUtils.getFirstUserMessage.mockResolvedValue('Test message');
      fileUtils.getSessionDuration.mockResolvedValue(120000);
      fileUtils.getSessionMetadata.mockResolvedValue({
        copilotVersion: '1.0.0',
        selectedModel: 'gpt-4'
      });

      const session = await sessionRepository.findById(sessionId);

      expect(session).toBeInstanceOf(Session);
      expect(session.id).toBe(sessionId);
      expect(session.type).toBe('file');
      expect(session.summary).toBe('Test message');
    });

    it('should return null if session not found', async () => {
      const sessionId = 'nonexistent-session';

      jest.spyOn(fs, 'stat')
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'));

      const session = await sessionRepository.findById(sessionId);

      expect(session).toBeNull();
    });

    it('should return null for entries that should be skipped', async () => {
      const sessionId = '.hidden';

      fileUtils.shouldSkipEntry.mockReturnValue(true);

      const session = await sessionRepository.findById(sessionId);

      expect(session).toBeNull();
    });
  });
});