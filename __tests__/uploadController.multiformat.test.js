const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn: _spawn } = require('child_process');
const UploadController = require('../src/controllers/uploadController');
const processManager = require('../src/utils/processManager');

// Mock child_process and processManager
jest.mock('child_process');
jest.mock('../src/utils/processManager');

// Helper: Create res object with Promise wrapper for async testing
function _createAsyncRes() {
  let resolveResponse;
  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });

  let statusCode = 200;

  const res = {
    _statusCode: 200,
    status(code) {
      statusCode = code;
      this._statusCode = code;
      return this;
    },
    json(data) {
      resolveResponse({ status: statusCode, body: data });
      return this;
    },
    download(filePath, filename, callback) {
      resolveResponse({ downloaded: true, path: filePath, filename });
      if (callback) callback();
      return this;
    }
  };

  jest.spyOn(res, 'status');
  jest.spyOn(res, 'json');

  res.responsePromise = responsePromise;
  return res;
}

describe('UploadController - Multi-Format Support', () => {
  let controller;
  let tmpSessionDirs;

  beforeEach(async () => {
    // Create temporary session directories for all formats
    tmpSessionDirs = {
      copilot: await fs.promises.mkdtemp(path.join(os.tmpdir(), 'copilot-test-')),
      claude: await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claude-test-')),
      'pi-mono': await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pi-mono-test-'))
    };

    process.env.SESSION_DIR = tmpSessionDirs.copilot;
    controller = new UploadController();

    // Ensure upload directory exists and is clean
    if (fs.existsSync(controller.uploadDir)) {
      await fs.promises.rm(controller.uploadDir, { recursive: true, force: true }).catch(() => {});
    }
    await fs.promises.mkdir(controller.uploadDir, { recursive: true });

    // Override session directories for testing
    controller.SESSION_DIRS = tmpSessionDirs;

    // Reset mocks
    jest.clearAllMocks();
    jest.restoreAllMocks();
    processManager.register.mockImplementation(() => {});
  });

  afterEach(async () => {
    // Cleanup - ignore errors if directory doesn't exist or has issues
    for (const dir of Object.values(tmpSessionDirs)) {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    if (fs.existsSync(controller.uploadDir)) {
      await fs.promises.rm(controller.uploadDir, { recursive: true, force: true }).catch(() => {});
    }
    delete process.env.SESSION_DIR;
  });

  describe('Format Detection', () => {
    it('should detect Pi-Mono format from timestamped filename', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const piMonoFile = '2026-02-09T11-24-27-935Z_abc-123-def.jsonl';
      await fs.promises.writeFile(path.join(extractDir, piMonoFile), '{"type":"session"}');

      const formatInfo = await controller._detectFormat(extractDir);

      expect(formatInfo).toEqual(expect.objectContaining({
        format: 'pi-mono',
        sessionId: 'abc-123-def',
        fileName: piMonoFile,
        extractDir
      }));

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should detect Copilot format from directory with events.jsonl', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const sessionId = 'test-session-123';
      const sessionDir = path.join(extractDir, sessionId);
      await fs.promises.mkdir(sessionDir);
      await fs.promises.writeFile(path.join(sessionDir, 'events.jsonl'), '{"type":"session.start"}');

      const formatInfo = await controller._detectFormat(extractDir);

      expect(formatInfo).toEqual(expect.objectContaining({
        format: 'copilot',
        sessionId,
        directoryName: sessionId,
        extractDir
      }));

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should detect Claude format from uuid.jsonl file', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const sessionId = 'abc-123-def-456';
      const claudeFile = `${sessionId}.jsonl`;
      await fs.promises.writeFile(path.join(extractDir, claudeFile), '{"type":"user"}');

      const formatInfo = await controller._detectFormat(extractDir);

      expect(formatInfo).toEqual(expect.objectContaining({
        format: 'claude',
        sessionId,
        fileName: claudeFile,
        hasDirectory: false,
        directoryName: undefined,
        extractDir
      }));

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should detect Claude format with optional directory', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const sessionId = 'abc-123-def-456';
      const claudeFile = `${sessionId}.jsonl`;
      const sessionDir = path.join(extractDir, sessionId);

      await fs.promises.writeFile(path.join(extractDir, claudeFile), '{"type":"user"}');
      await fs.promises.mkdir(sessionDir);
      await fs.promises.mkdir(path.join(sessionDir, 'subagents'));

      const formatInfo = await controller._detectFormat(extractDir);

      expect(formatInfo).toEqual(expect.objectContaining({
        format: 'claude',
        sessionId,
        fileName: claudeFile,
        hasDirectory: true,
        directoryName: sessionId,
        extractDir
      }));

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should return null for unknown format', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      await fs.promises.writeFile(path.join(extractDir, 'random.txt'), 'not a session');

      const formatInfo = await controller._detectFormat(extractDir);

      expect(formatInfo).toBeNull();

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should return null for empty directory', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));

      const formatInfo = await controller._detectFormat(extractDir);

      expect(formatInfo).toBeNull();

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });
  });

  describe('Import Copilot Session', () => {
    it('should successfully import Copilot format session', async () => {
      const sessionId = 'test-copilot-session';
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const sessionDir = path.join(extractDir, sessionId);

      await fs.promises.mkdir(sessionDir);
      await fs.promises.writeFile(path.join(sessionDir, 'events.jsonl'), '{"type":"session.start"}');
      await fs.promises.writeFile(path.join(sessionDir, 'workspace.yaml'), 'summary: test');

      const formatInfo = {
        format: 'copilot',
        sessionId,
        directoryName: sessionId,
        extractDir
      };

      const result = await controller._importCopilotSession(formatInfo, extractDir);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(sessionId);
      expect(result.format).toBe('copilot');

      // Verify files were moved
      const targetPath = path.join(tmpSessionDirs.copilot, sessionId);
      expect(fs.existsSync(targetPath)).toBe(true);
      expect(fs.existsSync(path.join(targetPath, 'events.jsonl'))).toBe(true);
      expect(fs.existsSync(path.join(targetPath, '.imported'))).toBe(true);

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should reject Copilot session without events.jsonl', async () => {
      const sessionId = 'test-copilot-session';
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const sessionDir = path.join(extractDir, sessionId);

      await fs.promises.mkdir(sessionDir);
      // No events.jsonl file

      const formatInfo = {
        format: 'copilot',
        sessionId,
        directoryName: sessionId,
        extractDir
      };

      const result = await controller._importCopilotSession(formatInfo, extractDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain('events.jsonl');
      expect(result.statusCode).toBe(400);

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should reject duplicate Copilot session', async () => {
      const sessionId = 'existing-session';
      const targetPath = path.join(tmpSessionDirs.copilot, sessionId);
      await fs.promises.mkdir(targetPath);

      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const sessionDir = path.join(extractDir, sessionId);
      await fs.promises.mkdir(sessionDir);
      await fs.promises.writeFile(path.join(sessionDir, 'events.jsonl'), '{"type":"session.start"}');

      const formatInfo = {
        format: 'copilot',
        sessionId,
        directoryName: sessionId,
        extractDir
      };

      const result = await controller._importCopilotSession(formatInfo, extractDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
      expect(result.statusCode).toBe(409);

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });
  });

  describe('Import Claude Session', () => {
    it('should successfully import Claude format session', async () => {
      const sessionId = 'abc-123-def-456';
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const claudeFile = `${sessionId}.jsonl`;

      await fs.promises.writeFile(path.join(extractDir, claudeFile), '{"type":"user"}');

      const formatInfo = {
        format: 'claude',
        sessionId,
        fileName: claudeFile,
        hasDirectory: false,
        extractDir
      };

      const req = { query: { project: 'test-project' } };
      const result = await controller._importClaudeSession(formatInfo, extractDir, req);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(sessionId);
      expect(result.format).toBe('claude');
      expect(result.project).toBe('test-project');

      // Verify file was moved
      const targetPath = path.join(tmpSessionDirs.claude, 'test-project', claudeFile);
      expect(fs.existsSync(targetPath)).toBe(true);

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should import Claude session with directory', async () => {
      const sessionId = 'abc-123-def-456';
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const claudeFile = `${sessionId}.jsonl`;
      const sessionDir = path.join(extractDir, sessionId);

      await fs.promises.writeFile(path.join(extractDir, claudeFile), '{"type":"user"}');
      await fs.promises.mkdir(sessionDir);
      await fs.promises.mkdir(path.join(sessionDir, 'subagents'));
      await fs.promises.writeFile(path.join(sessionDir, 'subagents', 'agent-1.jsonl'), '{"type":"user"}');

      const formatInfo = {
        format: 'claude',
        sessionId,
        fileName: claudeFile,
        hasDirectory: true,
        directoryName: sessionId,
        extractDir
      };

      const req = { query: { project: 'test-project' } };
      const result = await controller._importClaudeSession(formatInfo, extractDir, req);

      expect(result.success).toBe(true);

      // Verify both file and directory were moved
      const projectPath = path.join(tmpSessionDirs.claude, 'test-project');
      expect(fs.existsSync(path.join(projectPath, claudeFile))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, sessionId, 'subagents'))).toBe(true);

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should use default project if not specified', async () => {
      const sessionId = 'abc-123-def-456';
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const claudeFile = `${sessionId}.jsonl`;

      await fs.promises.writeFile(path.join(extractDir, claudeFile), '{"type":"user"}');

      const formatInfo = {
        format: 'claude',
        sessionId,
        fileName: claudeFile,
        hasDirectory: false,
        extractDir
      };

      const req = { query: {} };
      const result = await controller._importClaudeSession(formatInfo, extractDir, req);

      expect(result.success).toBe(true);
      expect(result.project).toBe('imported-sessions');

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });
  });

  describe('Import Pi-Mono Session', () => {
    it('should successfully import Pi-Mono format session', async () => {
      const sessionId = 'abc-123-def';
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const piMonoFile = `2026-02-09T11-24-27-935Z_${sessionId}.jsonl`;

      await fs.promises.writeFile(path.join(extractDir, piMonoFile), '{"type":"session"}');

      const formatInfo = {
        format: 'pi-mono',
        sessionId,
        fileName: piMonoFile,
        extractDir
      };

      const req = { query: { project: 'test-project' } };
      const result = await controller._importPiMonoSession(formatInfo, extractDir, req);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(sessionId);
      expect(result.format).toBe('pi-mono');
      expect(result.project).toBe('test-project');

      // Verify file was moved
      const targetPath = path.join(tmpSessionDirs['pi-mono'], 'test-project', piMonoFile);
      expect(fs.existsSync(targetPath)).toBe(true);

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should use default project if not specified', async () => {
      const sessionId = 'abc-123-def';
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const piMonoFile = `2026-02-09T11-24-27-935Z_${sessionId}.jsonl`;

      await fs.promises.writeFile(path.join(extractDir, piMonoFile), '{"type":"session"}');

      const formatInfo = {
        format: 'pi-mono',
        sessionId,
        fileName: piMonoFile,
        extractDir
      };

      const req = { query: {} };
      const result = await controller._importPiMonoSession(formatInfo, extractDir, req);

      expect(result.success).toBe(true);
      expect(result.project).toBe('imported-sessions');

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });
  });

  describe('Export Multi-Format Sessions', () => {
    it('should find and export Copilot session', async () => {
      const sessionId = 'test-copilot-export';
      const sessionPath = path.join(tmpSessionDirs.copilot, sessionId);
      await fs.promises.mkdir(sessionPath);
      await fs.promises.writeFile(path.join(sessionPath, 'events.jsonl'), '{"type":"session.start"}');

      const sessionInfo = await controller._findSessionLocation(sessionId, 'copilot');

      expect(sessionInfo).toBeDefined();
      expect(sessionInfo.source).toBe('copilot');
      expect(sessionInfo.sessionId).toBe(sessionId);
    });

    it('should find and export Claude session', async () => {
      const sessionId = 'test-claude-export';
      const projectPath = path.join(tmpSessionDirs.claude, 'test-project');
      await fs.promises.mkdir(projectPath, { recursive: true });
      await fs.promises.writeFile(path.join(projectPath, `${sessionId}.jsonl`), '{"type":"user"}');

      const sessionInfo = await controller._findSessionLocation(sessionId);

      expect(sessionInfo).toBeDefined();
      expect(sessionInfo.source).toBe('claude');
      expect(sessionInfo.sessionId).toBe(sessionId);
    });

    it('should find and export Pi-Mono session', async () => {
      const sessionId = 'test-pi-mono-export';
      const projectPath = path.join(tmpSessionDirs['pi-mono'], 'test-project');
      await fs.promises.mkdir(projectPath, { recursive: true });
      const piMonoFile = `2026-02-09T11-24-27-935Z_${sessionId}.jsonl`;
      await fs.promises.writeFile(path.join(projectPath, piMonoFile), '{"type":"session"}');

      const sessionInfo = await controller._findSessionLocation(sessionId);

      expect(sessionInfo).toBeDefined();
      expect(sessionInfo.source).toBe('pi-mono');
      expect(sessionInfo.sessionId).toBe(sessionId);
      expect(sessionInfo.fileName).toBe(piMonoFile);
    });

    it('should return null for non-existent session', async () => {
      const sessionInfo = await controller._findSessionLocation('nonexistent-id');

      expect(sessionInfo).toBeNull();
    });

    it('should prefer specified source when searching', async () => {
      const sessionId = 'duplicate-session';

      // Create session in both Copilot and Claude
      const copilotPath = path.join(tmpSessionDirs.copilot, sessionId);
      await fs.promises.mkdir(copilotPath);
      await fs.promises.writeFile(path.join(copilotPath, 'events.jsonl'), '{"type":"session.start"}');

      const claudeProjectPath = path.join(tmpSessionDirs.claude, 'test-project');
      await fs.promises.mkdir(claudeProjectPath, { recursive: true });
      await fs.promises.writeFile(path.join(claudeProjectPath, `${sessionId}.jsonl`), '{"type":"user"}');

      // Prefer Claude
      const sessionInfo = await controller._findSessionLocation(sessionId, 'claude');

      expect(sessionInfo).toBeDefined();
      expect(sessionInfo.source).toBe('claude');
    });
  });

  describe('End-to-End Import Tests', () => {
    it('should handle invalid session ID in archive', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const invalidSessionId = '../../../etc/passwd';
      const safeFile = 'test.jsonl';
      await fs.promises.writeFile(path.join(extractDir, safeFile), '{"type":"user"}');

      const formatInfo = {
        format: 'claude',
        sessionId: invalidSessionId,
        fileName: safeFile,
        hasDirectory: false,
        extractDir
      };

      const req = { query: {} };
      const result = await controller._importByFormat(formatInfo, extractDir, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid session ID');
      expect(result.statusCode).toBe(400);

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should handle unsupported format', async () => {
      const formatInfo = {
        format: 'unknown-format',
        sessionId: 'test-id',
        extractDir: '/tmp/test'
      };

      const req = { query: {} };
      const result = await controller._importByFormat(formatInfo, '/tmp/test', req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported format');
      expect(result.statusCode).toBe(400);
      expect(result.code).toBe('unsupported-format');
    });
  });

  describe('Structured Detection (adapter-based)', () => {
    it('should return structured match for unique candidate', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const sessionId = 'unique-copilot-session';
      await fs.promises.mkdir(path.join(extractDir, sessionId));
      await fs.promises.writeFile(path.join(extractDir, sessionId, 'events.jsonl'), '{"type":"session.start"}');

      const result = await controller._detectImportCandidates(extractDir);
      expect(result.status).toBe('matched');
      expect(result.match).toEqual(expect.objectContaining({
        source: 'copilot', matched: true, sessionId, score: expect.any(Number)
      }));

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should return ambiguous when multiple adapters match', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const id = 'shared-id';
      await fs.promises.mkdir(path.join(extractDir, id));
      await fs.promises.writeFile(path.join(extractDir, id, 'events.jsonl'), '{"type":"session.start"}');
      await fs.promises.writeFile(path.join(extractDir, `${id}.jsonl`), '{"type":"user"}');

      const result = await controller._detectImportCandidates(extractDir);
      expect(result.status).toBe('ambiguous');
      expect(result.matches.map(m => m.source).sort()).toEqual(['claude', 'copilot']);

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should return unsupported-format when nothing matches', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      await fs.promises.writeFile(path.join(extractDir, 'notes.txt'), 'not a session');

      const result = await controller._detectImportCandidates(extractDir);
      expect(result.status).toBe('unsupported-format');
      expect(result.error).toBe('Unsupported session zip format');
      expect(Array.isArray(result.candidates)).toBe(true);

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should return ambiguous-format on _importExtractedSession with multiple matches', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      const id = 'ambig-id';
      await fs.promises.mkdir(path.join(extractDir, id));
      await fs.promises.writeFile(path.join(extractDir, id, 'events.jsonl'), '{"type":"session.start"}');
      await fs.promises.writeFile(path.join(extractDir, `${id}.jsonl`), '{"type":"user"}');

      const result = await controller._importExtractedSession(extractDir, { query: {} });
      expect(result.success).toBe(false);
      expect(result.code).toBe('ambiguous-format');
      expect(result.statusCode).toBe(400);

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });

    it('should return unsupported-format on _importExtractedSession with no matches', async () => {
      const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extract-'));
      await fs.promises.writeFile(path.join(extractDir, 'readme.txt'), 'hello');

      const result = await controller._importExtractedSession(extractDir, { query: {} });
      expect(result.success).toBe(false);
      expect(result.code).toBe('unsupported-format');
      expect(result.statusCode).toBe(415);

      await fs.promises.rm(extractDir, { recursive: true, force: true });
    });
  });
});
