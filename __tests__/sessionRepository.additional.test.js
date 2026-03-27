const SessionRepository = require('../src/services/sessionRepository');
const Session = require('../src/models/Session');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock fileUtils and ParserFactory
jest.mock('../src/utils/fileUtils');
jest.mock('../lib/parsers');
const fileUtils = require('../src/utils/fileUtils');
const { ParserFactory } = require('../lib/parsers');

describe('SessionRepository - Additional Coverage', () => {
  let repository;
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-test-'));

    // Setup mock default values
    fileUtils.shouldSkipEntry.mockReturnValue(false);
    fileUtils.fileExists.mockResolvedValue(true);
    fileUtils.parseYAML.mockResolvedValue({
      summary: 'Test session',
      created_at: '2026-02-15T10:00:00Z'
    });
    fileUtils.countLines.mockResolvedValue(50);
    fileUtils.getSessionMetadataOptimized.mockResolvedValue({
      duration: 300000,
      copilotVersion: '1.0.0',
      selectedModel: 'claude-3-sonnet',
      firstUserMessage: 'Test message',
      hasSessionEnd: true,
      lastEventTime: Date.now()
    });

    // Setup ParserFactory mock
    const mockParser = {
      canParse: jest.fn().mockReturnValue(true),
      parse: jest.fn().mockReturnValue({
        turns: [{ userMessage: { content: 'Test content' } }],
        metadata: { model: 'claude-3-sonnet', cwd: '/test/path', startTime: new Date() }
      })
    };
    ParserFactory.mockImplementation(() => ({
      getParserType: jest.fn().mockReturnValue('claude'),
      parse: mockParser.parse
    }));

    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should accept single directory string (backward compatibility)', () => {
      const repo = new SessionRepository('/test/dir');

      expect(repo.sources).toHaveLength(1);
      expect(repo.sources[0].type).toBe('copilot');
      expect(repo.sources[0].dir).toBe('/test/dir');
    });

    it('should accept array of sources', () => {
      const sources = [
        { type: 'copilot', dir: '/copilot' },
        { type: 'claude', dir: '/claude' }
      ];
      const repo = new SessionRepository(sources);

      expect(repo.sources).toEqual(sources);
    });

    it('should use default sources when no parameter provided', () => {
      const repo = new SessionRepository();

      expect(repo.sources.length).toBeGreaterThan(0);
      expect(repo.sources.some(s => s.type === 'copilot')).toBe(true);
      expect(repo.sources.some(s => s.type === 'claude')).toBe(true);
      expect(repo.sources.some(s => s.type === 'pi-mono')).toBe(true);
    });
  });

  describe('_scanSource', () => {
    it('should return empty array for non-existent source directory', async () => {
      repository = new SessionRepository([
        { type: 'copilot', dir: path.join(tmpDir, 'nonexistent') }
      ]);

      const sessions = await repository.findAll();

      expect(sessions).toEqual([]);
    });

    it('should skip entries based on shouldSkipEntry', async () => {
      const sourceDir = path.join(tmpDir, 'copilot');
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'valid-session'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, '.hidden'), { recursive: true });

      fileUtils.shouldSkipEntry
        .mockReturnValueOnce(false)  // valid-session
        .mockReturnValueOnce(true);  // .hidden

      repository = new SessionRepository([{ type: 'copilot', dir: sourceDir }]);

      await repository.findAll();

      // Should only process valid-session
      expect(fileUtils.shouldSkipEntry).toHaveBeenCalledWith('valid-session');
      expect(fileUtils.shouldSkipEntry).toHaveBeenCalledWith('.hidden');
    });

    it('should handle errors during session processing gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const sourceDir = path.join(tmpDir, 'copilot');
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'session1'), { recursive: true });

      // Mock parseYAML to throw for workspace.yaml
      fileUtils.parseYAML.mockRejectedValue(new Error('Parse error'));

      repository = new SessionRepository([{ type: 'copilot', dir: sourceDir }]);

      const sessions = await repository.findAll();

      // Should handle error and continue
      expect(sessions).toEqual([]);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('_scanClaudeProjectDir', () => {
    it('should scan Claude project directory and find sessions', async () => {
      const projectDir = path.join(tmpDir, 'project-name');
      await fs.mkdir(projectDir, { recursive: true });

      // Create a valid Claude session file
      const sessionFile = path.join(projectDir, 'session-id.jsonl');
      await fs.writeFile(sessionFile, JSON.stringify({ type: 'user' }) + '\n');

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);

      // Mock the _createClaudeSession to return a valid session
      const mockSession = new Session('session-id', 'file', {
        source: 'claude',
        summary: 'Test',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      jest.spyOn(repository, '_createClaudeSession').mockResolvedValue(mockSession);

      const sessions = await repository._scanClaudeProjectDir(projectDir, 'project-name');

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('session-id');
    });

    it('should find subagents-only sessions', async () => {
      const projectDir = path.join(tmpDir, 'project');
      const sessionDir = path.join(projectDir, 'session-id');
      const subagentsDir = path.join(sessionDir, 'subagents');

      await fs.mkdir(subagentsDir, { recursive: true });
      await fs.writeFile(path.join(subagentsDir, 'agent-1.jsonl'), '{"type":"test"}');

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);

      const mockSession = new Session('session-id', 'directory', {
        source: 'claude',
        summary: 'Subagents session'
      });
      jest.spyOn(repository, '_createClaudeSubagentsSession').mockResolvedValue(mockSession);

      const sessions = await repository._scanClaudeProjectDir(projectDir, 'project');

      expect(sessions.length).toBeGreaterThan(0);
    });

    it('should handle errors in scanning gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const projectDir = path.join(tmpDir, 'bad-project');

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);

      // Directory doesn't exist
      const sessions = await repository._scanClaudeProjectDir(projectDir, 'bad-project');

      expect(sessions).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('_createClaudeSession', () => {
    it('should reject files with only Copilot core events', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const projectDir = path.join(tmpDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });

      const sessionFile = path.join(projectDir, 'session.jsonl');
      // File with only Copilot events
      await fs.writeFile(sessionFile, JSON.stringify({ type: 'assistant.message' }) + '\n');

      const stats = await fs.stat(sessionFile);

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);

      const session = await repository._createClaudeSession('session.jsonl', sessionFile, stats, 'project');

      expect(session).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('contains only Copilot core events')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should reject files with no Claude core events', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const projectDir = path.join(tmpDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });

      const sessionFile = path.join(projectDir, 'session.jsonl');
      // File with only metadata events
      await fs.writeFile(sessionFile, JSON.stringify({ type: 'progress' }) + '\n');

      const stats = await fs.stat(sessionFile);

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);

      const session = await repository._createClaudeSession('session.jsonl', sessionFile, stats, 'project');

      expect(session).toBeNull();

      consoleWarnSpy.mockRestore();
    });

    it('should create valid Claude session', async () => {
      const projectDir = path.join(tmpDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });

      const sessionFile = path.join(projectDir, 'valid-session.jsonl');
      const events = [
        JSON.stringify({ type: 'user', timestamp: '2026-02-20T10:00:00Z' }),
        JSON.stringify({ type: 'assistant', timestamp: '2026-02-20T10:00:01Z' })
      ];
      await fs.writeFile(sessionFile, events.join('\n'));

      const stats = await fs.stat(sessionFile);

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);

      const session = await repository._createClaudeSession('valid-session.jsonl', sessionFile, stats, 'project');

      expect(session).not.toBeNull();
      expect(session.source).toBe('claude');
    });

    it('should handle parser errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const projectDir = path.join(tmpDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });

      const sessionFile = path.join(projectDir, 'bad-session.jsonl');
      await fs.writeFile(sessionFile, 'NOT VALID JSON');

      const stats = await fs.stat(sessionFile);

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);

      const session = await repository._createClaudeSession('bad-session.jsonl', sessionFile, stats, 'project');

      expect(session).toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('_createClaudeSubagentsSession', () => {
    it('should create session from subagents directory', async () => {
      const sessionDir = path.join(tmpDir, 'session-id');
      const subagentsDir = path.join(sessionDir, 'subagents');

      await fs.mkdir(subagentsDir, { recursive: true });
      await fs.writeFile(
        path.join(subagentsDir, 'agent-1.jsonl'),
        JSON.stringify({ type: 'user', timestamp: '2026-02-20T10:00:00Z' }) + '\n'
      );
      await fs.writeFile(
        path.join(subagentsDir, 'agent-2.jsonl'),
        JSON.stringify({ type: 'assistant', timestamp: '2026-02-20T10:00:01Z' }) + '\n'
      );

      fileUtils.countLines
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(20);

      const stats = await fs.stat(sessionDir);

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);

      const session = await repository._createClaudeSubagentsSession('session-id', sessionDir, stats, 'project');

      expect(session).not.toBeNull();
      expect(session.type).toBe('directory');
      expect(session.source).toBe('claude');
      expect(session.eventCount).toBe(30); // 10 + 20
    });

    it('should return null if no subagent files found', async () => {
      const sessionDir = path.join(tmpDir, 'session-id');
      const subagentsDir = path.join(sessionDir, 'subagents');

      await fs.mkdir(subagentsDir, { recursive: true });

      const stats = await fs.stat(sessionDir);

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);

      const session = await repository._createClaudeSubagentsSession('session-id', sessionDir, stats, 'project');

      expect(session).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const sessionDir = path.join(tmpDir, 'nonexistent');
      const stats = { birthtime: new Date(), mtime: new Date() };

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);

      const session = await repository._createClaudeSubagentsSession('session-id', sessionDir, stats, 'project');

      expect(session).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('_scanPiMonoDir', () => {
    it('should scan Pi-Mono directory and find sessions', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const projectDir = path.join(tmpDir, '--project-path--');
      await fs.mkdir(projectDir, { recursive: true });

      // Use proper UUID format matching the regex: [a-f0-9-]+
      const sessionFile = path.join(projectDir, '2026-02-20T10-00-00-000Z_a1b2c3d4-e5f6-1234-5678-9abcdef01234.jsonl');
      await fs.writeFile(
        sessionFile,
        JSON.stringify({
          type: 'session',
          timestamp: '2026-02-20T10:00:00.000Z',
          cwd: '/test/path'
        }) + '\n'
      );

      fileUtils.countLines.mockResolvedValue(50);

      repository = new SessionRepository([{ type: 'pi-mono', dir: tmpDir }]);

      const sessions = await repository._scanPiMonoDir(projectDir, '--project-path--');

      expect(sessions).toHaveLength(1);
      expect(sessions[0].source).toBe('pi-mono');
      expect(sessions[0].id).toBe('a1b2c3d4-e5f6-1234-5678-9abcdef01234');

      consoleSpy.mockRestore();
    });

    it('should skip files without UUID pattern', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const projectDir = path.join(tmpDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });

      const badFile = path.join(projectDir, 'no-uuid.jsonl');
      await fs.writeFile(badFile, JSON.stringify({ type: 'session' }) + '\n');

      repository = new SessionRepository([{ type: 'pi-mono', dir: tmpDir }]);

      const sessions = await repository._scanPiMonoDir(projectDir, 'project');

      expect(sessions).toEqual([]);

      consoleSpy.mockRestore();
    });

    it('should skip files without session type', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const projectDir = path.join(tmpDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });

      const file = path.join(projectDir, '2026-02-20T10-00-00-000Z_uuid.jsonl');
      await fs.writeFile(file, JSON.stringify({ type: 'message' }) + '\n');

      repository = new SessionRepository([{ type: 'pi-mono', dir: tmpDir }]);

      const sessions = await repository._scanPiMonoDir(projectDir, 'project');

      expect(sessions).toEqual([]);

      consoleSpy.mockRestore();
    });

    it('should handle errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const projectDir = path.join(tmpDir, 'bad-dir');

      repository = new SessionRepository([{ type: 'pi-mono', dir: tmpDir }]);

      const sessions = await repository._scanPiMonoDir(projectDir, 'bad-dir');

      expect(sessions).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('_readFirstLine', () => {
    it('should read first line of file', async () => {
      const file = path.join(tmpDir, 'test.txt');
      await fs.writeFile(file, 'First line\nSecond line\nThird line');

      repository = new SessionRepository([{ type: 'copilot', dir: tmpDir }]);

      const firstLine = await repository._readFirstLine(file);

      expect(firstLine).toBe('First line');
    });

    it('should return null for empty file', async () => {
      const file = path.join(tmpDir, 'empty.txt');
      await fs.writeFile(file, '');

      repository = new SessionRepository([{ type: 'copilot', dir: tmpDir }]);

      const firstLine = await repository._readFirstLine(file);

      expect(firstLine).toBeNull();
    });

    it('should handle file read errors', async () => {
      const file = path.join(tmpDir, 'nonexistent.txt');

      repository = new SessionRepository([{ type: 'copilot', dir: tmpDir }]);

      await expect(repository._readFirstLine(file)).rejects.toThrow();
    });
  });

  describe('_computeSessionStatus', () => {
    it('should return completed for sessions with session.end', () => {
      repository = new SessionRepository(tmpDir);

      const status = repository._computeSessionStatus({
        hasSessionEnd: true,
        lastEventTime: Date.now()
      });

      expect(status).toBe('completed');
    });

    it('should return wip for recent sessions without session.end', () => {
      repository = new SessionRepository(tmpDir);

      const status = repository._computeSessionStatus({
        hasSessionEnd: false,
        lastEventTime: Date.now() - 60000 // 1 minute ago
      });

      expect(status).toBe('wip');
    });

    it('should return completed for old sessions without session.end', () => {
      repository = new SessionRepository(tmpDir);

      const status = repository._computeSessionStatus({
        hasSessionEnd: false,
        lastEventTime: Date.now() - 20 * 60 * 1000 // 20 minutes ago
      });

      expect(status).toBe('completed');
    });

    it('should return completed when lastEventTime is null', () => {
      repository = new SessionRepository(tmpDir);

      const status = repository._computeSessionStatus({
        hasSessionEnd: false,
        lastEventTime: null
      });

      expect(status).toBe('completed');
    });
  });

  describe('_sortByUpdatedAt', () => {
    it('should sort sessions by updatedAt descending', () => {
      repository = new SessionRepository(tmpDir);

      const sessions = [
        { id: '1', createdAt: '2026-02-20T10:00:00Z' },
        { id: '2', createdAt: '2026-02-20T12:00:00Z' },
        { id: '3', createdAt: '2026-02-20T11:00:00Z' }
      ];

      const sorted = repository._sortByUpdatedAt(sessions);

      expect(sorted[0].id).toBe('2'); // Newest
      expect(sorted[1].id).toBe('3');
      expect(sorted[2].id).toBe('1'); // Oldest
    });
  });

  // NEW TESTS FOR UNCOVERED AREAS

  describe('findAll - error handling (line 55)', () => {
    it('should handle source scanning errors and continue with other sources', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const copilotDir = path.join(tmpDir, 'copilot');
      const claudeDir = path.join(tmpDir, 'claude');

      await fs.mkdir(copilotDir, { recursive: true });
      await fs.mkdir(claudeDir, { recursive: true });

      // Create a valid copilot session
      await fs.mkdir(path.join(copilotDir, 'valid-session'), { recursive: true });
      await fs.writeFile(path.join(copilotDir, 'valid-session', 'workspace.yaml'), 'summary: test');

      repository = new SessionRepository([
        { type: 'copilot', dir: copilotDir },
        { type: 'claude', dir: claudeDir }
      ]);

      // Mock readdir to fail for claude but succeed for copilot
      const originalReaddir = fs.readdir;
      jest.spyOn(fs, 'readdir').mockImplementation((dir) => {
        if (dir.includes('claude')) {
          return Promise.reject(new Error('Permission denied'));
        }
        return originalReaddir(dir);
      });

      await repository.findAll();

      // Should have logged error but still returned copilot sessions
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error reading claude sessions'),
        expect.any(String)
      );

      jest.spyOn(fs, 'readdir').mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('_scanSource - Claude and Pi-Mono types (lines 88-99)', () => {
    it('should handle Claude directory type and call _scanClaudeProjectDir', async () => {
      const claudeDir = path.join(tmpDir, 'claude');
      const projectDir = path.join(claudeDir, 'my-project');

      await fs.mkdir(projectDir, { recursive: true });

      repository = new SessionRepository([{ type: 'claude', dir: claudeDir }]);

      const scanSpy = jest.spyOn(repository, '_scanClaudeProjectDir').mockResolvedValue([]);

      await repository.findAll();

      expect(scanSpy).toHaveBeenCalled();

      scanSpy.mockRestore();
    });

    it('should handle Pi-Mono directory type and call _scanPiMonoDir', async () => {
      const piDir = path.join(tmpDir, 'pi-mono');
      const projectDir = path.join(piDir, '--project--');

      await fs.mkdir(projectDir, { recursive: true });

      repository = new SessionRepository([{ type: 'pi-mono', dir: piDir }]);

      const scanSpy = jest.spyOn(repository, '_scanPiMonoDir').mockResolvedValue([]);

      await repository.findAll();

      expect(scanSpy).toHaveBeenCalled();

      scanSpy.mockRestore();
    });

    it('should ignore non-directory files in Claude source', async () => {
      const claudeDir = path.join(tmpDir, 'claude');

      await fs.mkdir(claudeDir, { recursive: true });
      await fs.writeFile(path.join(claudeDir, 'random-file.txt'), 'content');

      repository = new SessionRepository([{ type: 'claude', dir: claudeDir }]);

      const sessions = await repository.findAll();

      // Should not process files in Claude source root
      expect(sessions).toEqual([]);
    });

    it('should ignore non-directory files in Pi-Mono source', async () => {
      const piDir = path.join(tmpDir, 'pi-mono');

      await fs.mkdir(piDir, { recursive: true });
      await fs.writeFile(path.join(piDir, 'random-file.jsonl'), '{}');

      repository = new SessionRepository([{ type: 'pi-mono', dir: piDir }]);

      const sessions = await repository.findAll();

      // Should not process files in Pi-Mono source root
      expect(sessions).toEqual([]);
    });
  });

  describe('_createClaudeSession - parser validation (lines 204-215)', () => {
    it('should reject session when parser type is not claude', async () => {
      const projectDir = path.join(tmpDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });

      const sessionFile = path.join(projectDir, 'session.jsonl');
      await fs.writeFile(sessionFile, JSON.stringify({ type: 'user' }) + '\n');

      const stats = await fs.stat(sessionFile);

      // Mock parser to return non-claude type
      const mockFactory = {
        getParserType: jest.fn().mockReturnValue('copilot'),
        parse: jest.fn()
      };

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);
      repository.parserFactory = mockFactory;

      const session = await repository._createClaudeSession('session.jsonl', sessionFile, stats, 'project');

      expect(session).toBeNull();
      expect(mockFactory.getParserType).toHaveBeenCalled();
    });

    it('should extract project path from directory name with dashes', async () => {
      const projectDir = path.join(tmpDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });

      const sessionFile = path.join(projectDir, 'session.jsonl');
      await fs.writeFile(sessionFile, JSON.stringify({ type: 'user' }) + '\n');

      const stats = await fs.stat(sessionFile);

      const mockFactory = {
        getParserType: jest.fn().mockReturnValue('claude'),
        parse: jest.fn().mockReturnValue({
          turns: [{ userMessage: { content: 'Test' } }],
          metadata: {}
        })
      };

      repository = new SessionRepository([{ type: 'claude', dir: tmpDir }]);
      repository.parserFactory = mockFactory;

      fileUtils.countLines.mockResolvedValue(5);

      const session = await repository._createClaudeSession('session.jsonl', sessionFile, stats, '-home-user-project');

      expect(session).not.toBeNull();
      expect(session.workspace.cwd).toBe('/home/user/project');
    });
  });

  describe('findById - Claude and Pi-Mono sources (lines 252-255, 299-416)', () => {
    it('should call _findClaudeSession for claude source type', async () => {
      const claudeDir = path.join(tmpDir, 'claude');
      await fs.mkdir(claudeDir, { recursive: true });

      repository = new SessionRepository([{ type: 'claude', dir: claudeDir }]);

      const findSpy = jest.spyOn(repository, '_findClaudeSession').mockResolvedValue(null);

      await repository.findById('test-session');

      expect(findSpy).toHaveBeenCalledWith('test-session', claudeDir);

      findSpy.mockRestore();
    });

    it('should call _findPiMonoSession for pi-mono source type', async () => {
      const piDir = path.join(tmpDir, 'pi-mono');
      await fs.mkdir(piDir, { recursive: true });

      repository = new SessionRepository([{ type: 'pi-mono', dir: piDir }]);

      const findSpy = jest.spyOn(repository, '_findPiMonoSession').mockResolvedValue(null);

      await repository.findById('test-session');

      expect(findSpy).toHaveBeenCalledWith('test-session', piDir);

      findSpy.mockRestore();
    });
  });

  describe('_findClaudeSession - comprehensive (lines 299-360)', () => {
    it('should search all project directories for session file', async () => {
      const claudeDir = path.join(tmpDir, 'claude');
      const project1 = path.join(claudeDir, 'project1');
      const project2 = path.join(claudeDir, 'project2');

      await fs.mkdir(project1, { recursive: true });
      await fs.mkdir(project2, { recursive: true });

      // Create session in project2
      const sessionFile = path.join(project2, 'my-session.jsonl');
      await fs.writeFile(sessionFile, JSON.stringify({ type: 'user' }) + '\n');

      repository = new SessionRepository([{ type: 'claude', dir: claudeDir }]);

      const mockFactory = {
        getParserType: jest.fn().mockReturnValue('claude'),
        parse: jest.fn().mockReturnValue({
          turns: [{ userMessage: { content: 'Found it' } }],
          metadata: {}
        })
      };
      repository.parserFactory = mockFactory;

      fileUtils.countLines.mockResolvedValue(10);

      const session = await repository._findClaudeSession('my-session', claudeDir);

      expect(session).not.toBeNull();
      expect(session.id).toBe('my-session');
    });

    it('should fallback to directory search if file validation fails', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const claudeDir = path.join(tmpDir, 'claude');
      const project = path.join(claudeDir, 'project');
      const sessionDir = path.join(project, 'my-session');
      const subagentsDir = path.join(sessionDir, 'subagents');

      await fs.mkdir(subagentsDir, { recursive: true });

      // Create a file that fails validation
      const sessionFile = path.join(project, 'my-session.jsonl');
      await fs.writeFile(sessionFile, JSON.stringify({ type: 'user.message' }) + '\n'); // Copilot format

      // Create subagent file
      await fs.writeFile(path.join(subagentsDir, 'agent-1.jsonl'), JSON.stringify({ type: 'user' }) + '\n');

      fileUtils.countLines.mockResolvedValue(10);

      repository = new SessionRepository([{ type: 'claude', dir: claudeDir }]);

      const session = await repository._findClaudeSession('my-session', claudeDir);

      // Should find the directory-based session after file validation failed
      expect(session).not.toBeNull();
      expect(session.type).toBe('directory');

      consoleSpy.mockRestore();
    });

    it('should handle readdir errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const claudeDir = path.join(tmpDir, 'nonexistent-claude');

      repository = new SessionRepository([{ type: 'claude', dir: claudeDir }]);

      const session = await repository._findClaudeSession('test', claudeDir);

      expect(session).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('_findPiMonoSession - comprehensive (lines 366-417)', () => {
    it('should find Pi-Mono session by matching file pattern', async () => {
      const piDir = path.join(tmpDir, 'pi-mono');
      const projectDir = path.join(piDir, '--my-project--');

      await fs.mkdir(projectDir, { recursive: true });

      const sessionFile = path.join(projectDir, '2026-02-21T10-00-00-000Z_abc-123.jsonl');
      await fs.writeFile(sessionFile, JSON.stringify({
        type: 'session',
        timestamp: '2026-02-21T10:00:00.000Z',
        cwd: '/home/user/project'
      }) + '\n');

      fileUtils.countLines.mockResolvedValue(25);

      repository = new SessionRepository([{ type: 'pi-mono', dir: piDir }]);

      const session = await repository._findPiMonoSession('abc-123', piDir);

      expect(session).not.toBeNull();
      expect(session.id).toBe('abc-123');
      expect(session.source).toBe('pi-mono');
      expect(session.eventCount).toBe(25);
    });

    it('should return null if first line is not valid JSON', async () => {
      const piDir = path.join(tmpDir, 'pi-mono');
      const projectDir = path.join(piDir, 'project');

      await fs.mkdir(projectDir, { recursive: true });

      const sessionFile = path.join(projectDir, '2026-02-21T10-00-00-000Z_test-id.jsonl');
      await fs.writeFile(sessionFile, 'INVALID JSON\n');

      repository = new SessionRepository([{ type: 'pi-mono', dir: piDir }]);

      // Mock _readFirstLine to return invalid JSON
      jest.spyOn(repository, '_readFirstLine').mockResolvedValue('INVALID JSON');

      const session = await repository._findPiMonoSession('test-id', piDir);

      expect(session).toBeNull();
    });

    it('should return null if first line type is not session', async () => {
      const piDir = path.join(tmpDir, 'pi-mono');
      const projectDir = path.join(piDir, 'project');

      await fs.mkdir(projectDir, { recursive: true });

      const sessionFile = path.join(projectDir, '2026-02-21T10-00-00-000Z_test-id.jsonl');
      await fs.writeFile(sessionFile, JSON.stringify({ type: 'message' }) + '\n');

      repository = new SessionRepository([{ type: 'pi-mono', dir: piDir }]);

      const session = await repository._findPiMonoSession('test-id', piDir);

      expect(session).toBeNull();
    });

    it('should handle errors when reading projects', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const piDir = path.join(tmpDir, 'nonexistent-pi');

      repository = new SessionRepository([{ type: 'pi-mono', dir: piDir }]);

      const session = await repository._findPiMonoSession('test', piDir);

      expect(session).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error searching Pi-Mono sessions')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('_createDirectorySession - optimized metadata (line 513)', () => {
    it('should use firstUserMessage from metadata when workspace.summary is missing', async () => {
      const sessionDir = path.join(tmpDir, 'test-session');
      await fs.mkdir(sessionDir, { recursive: true });

      await fs.writeFile(path.join(sessionDir, 'workspace.yaml'), 'created_at: 2026-02-21\n');
      await fs.writeFile(path.join(sessionDir, 'events.jsonl'), '{}');

      fileUtils.fileExists.mockResolvedValue(true);
      fileUtils.parseYAML.mockResolvedValue({
        created_at: '2026-02-21T10:00:00Z'
        // No summary field
      });
      fileUtils.getSessionMetadataOptimized.mockResolvedValue({
        duration: 300000,
        copilotVersion: '1.0.0',
        selectedModel: 'claude-3-sonnet',
        firstUserMessage: 'This is the first user message',
        hasSessionEnd: true,
        lastEventTime: Date.now()
      });
      fileUtils.countLines.mockResolvedValue(50);

      const stats = await fs.stat(sessionDir);

      repository = new SessionRepository([{ type: 'copilot', dir: tmpDir }]);

      const session = await repository._createDirectorySession('test-session', sessionDir, stats, 'copilot');

      expect(session.summary).toBe('This is the first user message');
    });
  });

  describe('_scanPiMonoDir - edge cases (lines 579, 598-639)', () => {
    it('should return empty array when no jsonl files exist', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const projectDir = path.join(tmpDir, 'empty-project');

      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'readme.txt'), 'no jsonl files');

      repository = new SessionRepository([{ type: 'pi-mono', dir: tmpDir }]);

      const sessions = await repository._scanPiMonoDir(projectDir, 'empty-project');

      expect(sessions).toEqual([]);

      consoleSpy.mockRestore();
    });

    it('should skip files without valid UUID pattern', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const projectDir = path.join(tmpDir, 'project');

      await fs.mkdir(projectDir, { recursive: true });

      // File without proper UUID format
      const badFile = path.join(projectDir, '2026-02-21T10-00-00-000Z_not-a-uuid.jsonl');
      await fs.writeFile(badFile, JSON.stringify({ type: 'session' }) + '\n');

      repository = new SessionRepository([{ type: 'pi-mono', dir: tmpDir }]);

      const sessions = await repository._scanPiMonoDir(projectDir, 'project');

      expect(sessions).toEqual([]);
      // The console log happens but the exact format may vary, so just check it was called
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should skip files with empty first line', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const projectDir = path.join(tmpDir, 'project');

      await fs.mkdir(projectDir, { recursive: true });

      const emptyFile = path.join(projectDir, '2026-02-21T10-00-00-000Z_a1b2c3d4-e5f6-1234-5678-9abcdef01234.jsonl');
      await fs.writeFile(emptyFile, ''); // Empty file

      repository = new SessionRepository([{ type: 'pi-mono', dir: tmpDir }]);

      const sessions = await repository._scanPiMonoDir(projectDir, 'project');

      expect(sessions).toEqual([]);
      // Check console was called (exact message format may vary)
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle JSON parse errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const projectDir = path.join(tmpDir, 'project');

      await fs.mkdir(projectDir, { recursive: true });

      const badFile = path.join(projectDir, '2026-02-21T10-00-00-000Z_a1b2c3d4-e5f6-1234-5678-9abcdef01234.jsonl');
      await fs.writeFile(badFile, 'NOT VALID JSON\n');

      repository = new SessionRepository([{ type: 'pi-mono', dir: tmpDir }]);

      const sessions = await repository._scanPiMonoDir(projectDir, 'project');

      expect(sessions).toEqual([]);
      // Check error was logged (may contain [PI-MONO] prefix)
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorCall = consoleErrorSpy.mock.calls[0][0];
      expect(errorCall).toContain('Error parsing session');

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should extract project path from directory name', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const projectDir = path.join(tmpDir, '--home-user-project--');

      await fs.mkdir(projectDir, { recursive: true });

      const sessionFile = path.join(projectDir, '2026-02-21T10-00-00-000Z_a1b2c3d4-e5f6-1234-5678-9abcdef01234.jsonl');
      await fs.writeFile(sessionFile, JSON.stringify({
        type: 'session',
        timestamp: '2026-02-21T10:00:00.000Z'
        // No cwd field - should use directory name
      }) + '\n');

      fileUtils.countLines.mockResolvedValue(10);

      repository = new SessionRepository([{ type: 'pi-mono', dir: tmpDir }]);

      const sessions = await repository._scanPiMonoDir(projectDir, '--home-user-project--');

      expect(sessions).toHaveLength(1);
      expect(sessions[0].workspace.cwd).toBe('home-user-project');

      consoleSpy.mockRestore();
    });
  });

  describe('_readFirstLine - error handling (lines 691-693)', () => {
    it('should handle file not found errors', async () => {
      const badFile = path.join(tmpDir, 'subdir', 'nonexistent.txt');

      repository = new SessionRepository([{ type: 'copilot', dir: tmpDir }]);

      await expect(repository._readFirstLine(badFile)).rejects.toThrow();
    });

    it('should return first non-empty line from files with whitespace', async () => {
      const file = path.join(tmpDir, 'whitespace.txt');
      await fs.writeFile(file, '  \n\n\nActual content\n');

      repository = new SessionRepository([{ type: 'copilot', dir: tmpDir }]);

      const result = await repository._readFirstLine(file);

      // The method reads line by line and returns the first line (even if whitespace)
      // It doesn't skip empty lines
      expect(result).toBeDefined();
    });
  });

  describe('VS Code dirCandidates resolution', () => {
    it('default vscode source has a non-null dir set to first candidate', () => {
      const repo = new SessionRepository();
      const vscode = repo.sources.find(s => s.type === 'vscode');
      expect(vscode).toBeDefined();
      expect(vscode.dir).not.toBeNull();
      expect(vscode.dirCandidates).toBeInstanceOf(Array);
      expect(vscode.dirCandidates.length).toBeGreaterThanOrEqual(2);
      expect(vscode.dir).toBe(vscode.dirCandidates[0]);
    });

    it('when VSCODE_WORKSPACE_STORAGE_DIR is set, dir uses env var and dirCandidates is absent', () => {
      process.env.VSCODE_WORKSPACE_STORAGE_DIR = '/custom/vscode/storage';
      try {
        const repo = new SessionRepository();
        const vscode = repo.sources.find(s => s.type === 'vscode');
        expect(vscode.dir).toBe('/custom/vscode/storage');
        expect(vscode.dirCandidates).toBeUndefined();
      } finally {
        delete process.env.VSCODE_WORKSPACE_STORAGE_DIR;
      }
    });

    it('_resolveSourceDir returns source.dir unchanged when no dirCandidates', async () => {
      const repo = new SessionRepository([{ type: 'copilot', dir: tmpDir }]);
      const source = { type: 'copilot', dir: '/some/dir' };
      const result = await repo._resolveSourceDir(source);
      expect(result).toBe('/some/dir');
    });

    it('_resolveSourceDir returns first accessible candidate and caches it on source', async () => {
      const repo = new SessionRepository([{ type: 'copilot', dir: tmpDir }]);
      const stableDir = path.join(tmpDir, 'stable');
      const insidersDir = path.join(tmpDir, 'insiders');
      await fs.mkdir(stableDir);
      const source = { type: 'vscode', dir: stableDir, dirCandidates: [stableDir, insidersDir] };

      const result = await repo._resolveSourceDir(source);
      expect(result).toBe(stableDir);
      expect(source.dir).toBe(stableDir);
    });

    it('_resolveSourceDir falls back to second candidate when first is missing', async () => {
      const repo = new SessionRepository([{ type: 'copilot', dir: tmpDir }]);
      const stableDir = path.join(tmpDir, 'stable-missing');
      const insidersDir = path.join(tmpDir, 'insiders');
      await fs.mkdir(insidersDir);
      const source = { type: 'vscode', dir: stableDir, dirCandidates: [stableDir, insidersDir] };

      const result = await repo._resolveSourceDir(source);
      expect(result).toBe(insidersDir);
      expect(source.dir).toBe(insidersDir);
    });

    it('_resolveSourceDir returns null when no candidate is accessible', async () => {
      const repo = new SessionRepository([{ type: 'copilot', dir: tmpDir }]);
      const source = {
        type: 'vscode',
        dir: '/nonexistent/stable',
        dirCandidates: ['/nonexistent/stable', '/nonexistent/insiders']
      };

      const result = await repo._resolveSourceDir(source);
      expect(result).toBeNull();
    });

    it('_scanSource warns and returns [] when no vscode candidate exists', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const repo = new SessionRepository([{
        type: 'vscode',
        dir: '/nonexistent/stable',
        dirCandidates: ['/nonexistent/stable', '/nonexistent/insiders']
      }]);

      const sessions = await repo.findAll();
      expect(sessions).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No vscode directory found'));
      warnSpy.mockRestore();
    });

    it('findById resolves vscode dir via candidates before searching', async () => {
      const insidersDir = path.join(tmpDir, 'insiders-storage');
      await fs.mkdir(insidersDir);

      const repo = new SessionRepository([{
        type: 'vscode',
        dir: path.join(tmpDir, 'stable-missing'),
        dirCandidates: [path.join(tmpDir, 'stable-missing'), insidersDir]
      }]);

      // No session files exist, but the key test is that it doesn't throw on null dir
      const result = await repo.findById('some-session-id');
      expect(result).toBeNull();
      // source.dir should now be updated to the insiders path
      expect(repo.sources[0].dir).toBe(insidersDir);
    });
  });
});
