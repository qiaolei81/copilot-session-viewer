const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const InsightService = require('../src/server/services/insightService');
const processManager = require('../src/server/utils/processManager');
const config = require('../src/server/config');

// Mock child_process spawn
jest.mock('child_process');
jest.mock('../src/server/utils/processManager');
jest.mock('../src/server/config', () => ({
  INSIGHT_TIMEOUT_MS: 5 * 60 * 1000
}));

describe('InsightService', () => {
  let tmpDir;
  let service;
  let sessionId;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'insight-test-'));
    service = new InsightService(tmpDir);
    sessionId = 'test-session-id';

    // Reset all mocks
    jest.clearAllMocks();
    jest.restoreAllMocks();
    processManager.register.mockImplementation(() => {});
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  /**
   * Helper to create a mock copilot process with proper event emitters
   */
  function createMockCopilotProcess() {
    const stdinEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    const processEmitter = new EventEmitter();

    const mockStdin = Object.assign(stdinEmitter, {
      write: jest.fn(),
      end: jest.fn()
    });

    const mockStdout = {
      pipe: jest.fn()
    };

    const mockStderr = Object.assign(stderrEmitter, {});

    const mockProcess = Object.assign(processEmitter, {
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr
    });

    return { mockProcess, mockStdin, mockStdout, mockStderr };
  }

  /**
   * Helper to setup file system mocks for copilot process
   */
  function setupFileMocks() {
    const mockReadStream = Object.assign(new EventEmitter(), {
      pipe: jest.fn(),
      destroy: jest.fn()
    });

    const mockWriteStream = Object.assign(new EventEmitter(), {
      end: jest.fn()
    });

    jest.spyOn(fsSync, 'createReadStream').mockReturnValue(mockReadStream);
    jest.spyOn(fsSync, 'createWriteStream').mockReturnValue(mockWriteStream);

    return { mockReadStream, mockWriteStream };
  }

  describe('generateInsight', () => {
    it('should return existing completed insight', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const insightFile = path.join(sessionPath, `${sessionId}.agent-review.md`);
      const reportContent = '# Test Report\nThis is a test report.';
      await fs.writeFile(insightFile, reportContent);

      const result = await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      expect(result.status).toBe('completed');
      expect(result.report).toBe(reportContent);
      expect(result.generatedAt).toBeDefined();
    });

    it('should force regenerate when requested', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, '{"type":"test","data":"test"}');

      const insightFile = path.join(sessionPath, `${sessionId}.agent-review.md`);
      await fs.writeFile(insightFile, '# Old Report');

      // Mock spawn for copilot process
      const { mockProcess } = createMockCopilotProcess();
      setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      const result = await service.generateInsight(sessionId, sessionPath, 'copilot', true);

      expect(result.status).toBe('generating');
      expect(spawn).toHaveBeenCalled();

      // Verify lock was created
      const lockFile = path.join(sessionPath, `${sessionId}.agent-review.md.lock`);
      const lockExists = await fs.access(lockFile).then(() => true).catch(() => false);
      expect(lockExists).toBe(true);
    });

    it('should handle case where insight file does not exist when force regenerating', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, '{"type":"test"}');

      // Don't create insight file - force regenerate should handle gracefully
      const { mockProcess } = createMockCopilotProcess();
      setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      const result = await service.generateInsight(sessionId, sessionPath, 'copilot', true);

      expect(result.status).toBe('generating');
      expect(spawn).toHaveBeenCalled();
    });

    it('should return generating status if lock file exists', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const lockFile = path.join(sessionPath, `${sessionId}.agent-review.md.lock`);
      await fs.writeFile(lockFile, JSON.stringify({
        sessionId,
        startTime: new Date().toISOString(),
        pid: 12345
      }));

      const result = await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      expect(result.status).toBe('generating');
      expect(result.report).toContain('Another request is currently generating');
    });

    it('should remove stale lock files', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, '{"type":"test"}');

      const lockFile = path.join(sessionPath, `${sessionId}.agent-review.md.lock`);
      await fs.writeFile(lockFile, JSON.stringify({
        sessionId,
        startTime: new Date(Date.now() - config.INSIGHT_TIMEOUT_MS - 10000).toISOString(),
        pid: 12345
      }));

      // Make lock file old
      const oldTime = Date.now() - config.INSIGHT_TIMEOUT_MS - 10000;
      await fs.utimes(lockFile, new Date(oldTime), new Date(oldTime));

      // Mock spawn
      const { mockProcess } = createMockCopilotProcess();
      setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      expect(result.status).toBe('generating');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Removing stale lock file'));

      consoleLogSpy.mockRestore();
    });

    it('should throw error if events file not found', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      await expect(service.generateInsight(sessionId, sessionPath, 'copilot', false)).rejects.toThrow('Events file not found');
    });

    it('should spawn copilot process correctly', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, '{"type":"test","data":"test"}');

      const { mockProcess } = createMockCopilotProcess();
      setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      expect(spawn).toHaveBeenCalledWith(
        'copilot',
        expect.arrayContaining(['--config-dir', '--yolo', '-p']),
        expect.objectContaining({
          cwd: sessionPath,
          stdio: ['pipe', 'pipe', 'pipe']
        })
      );
      expect(processManager.register).toHaveBeenCalledWith(mockProcess, { name: `insight-${sessionId}` });
    });

    it('should handle empty session data', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, ''); // Empty file

      const { mockProcess } = createMockCopilotProcess();
      setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      const result = await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      expect(result.status).toBe('generating');
      expect(spawn).toHaveBeenCalled();
    });

    it('should handle malformed events data', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, '{invalid json}\n{"type":"valid"}');

      const { mockProcess } = createMockCopilotProcess();
      setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      const result = await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      expect(result.status).toBe('generating');
      expect(spawn).toHaveBeenCalled();
    });
  });

  describe('_spawnCopilotProcess', () => {
    it('should handle successful copilot execution with direct output', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      const insightFile = path.join(sessionPath, `${sessionId}.agent-review.md`);
      const tmpFile = path.join(sessionPath, `${sessionId}.agent-review.md.tmp`);
      await fs.writeFile(eventsFile, '{"type":"test"}');

      const { mockProcess } = createMockCopilotProcess();
      const { mockReadStream } = setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      mockReadStream.pipe.mockImplementation((destination) => destination);

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Write direct output to insight file (agent wrote directly)
      await fs.writeFile(insightFile, '# Direct Output\nThis is a good report with enough content for validation.');
      await fs.writeFile(tmpFile, ''); // Empty tmp file

      mockProcess.emit('close', 0);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('agent wrote directly'));

      consoleLogSpy.mockRestore();
    });

    it('should handle successful copilot execution with stdout fallback', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      const tmpFile = path.join(sessionPath, `${sessionId}.agent-review.md.tmp`);
      await fs.writeFile(eventsFile, '{"type":"test"}');

      const { mockProcess } = createMockCopilotProcess();
      const { mockReadStream } = setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      mockReadStream.pipe.mockImplementation((destination) => destination);

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Write output to tmp file (stdout capture)
      const reportContent = '## 🎯 Effectiveness Score: 85/100\nGood analysis here.';
      await fs.writeFile(tmpFile, reportContent);

      mockProcess.emit('close', 0);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('cleaned from stdout'));

      consoleLogSpy.mockRestore();
    });

    it('should handle EPIPE error gracefully', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, '{"type":"test"}');

      const { mockProcess } = createMockCopilotProcess();
      const { mockReadStream } = setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      mockReadStream.pipe.mockImplementation((destination) => {
        // Simulate EPIPE error
        setTimeout(() => destination.emit('error', { code: 'EPIPE' }), 5);
        return destination;
      });

      await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockReadStream.destroy).toHaveBeenCalled();
    });

    it('should handle non-EPIPE stdin errors', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, '{"type":"test"}');

      const { mockProcess } = createMockCopilotProcess();
      const { mockReadStream } = setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mockReadStream.pipe.mockImplementation((destination) => {
        setTimeout(() => destination.emit('error', { code: 'EIO', message: 'IO error' }), 5);
        return destination;
      });

      await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ stdin error:', expect.any(Object));
      consoleErrorSpy.mockRestore();
    });

    it('should handle copilot failure with stderr output', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, '{"type":"test"}');
      const insightFile = path.join(sessionPath, `${sessionId}.agent-review.md`);
      const tmpFile = path.join(sessionPath, `${sessionId}.agent-review.md.tmp`);

      const { mockProcess, mockStderr } = createMockCopilotProcess();
      const { mockReadStream } = setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      mockReadStream.pipe.mockImplementation((destination) => destination);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate stderr data
      mockStderr.emit('data', Buffer.from('Error: something went wrong\n'));
      mockStderr.emit('data', Buffer.from('More error details\n'));

      // Write tmp file
      await fs.writeFile(tmpFile, 'partial output');

      // Simulate failure
      mockProcess.emit('close', 1);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify error was written to insight file
      const content = await fs.readFile(insightFile, 'utf-8').catch(() => '');
      expect(content).toContain('Generation Failed');
      expect(content).toContain('something went wrong');

      consoleErrorSpy.mockRestore();
    });

    it('should cap stderr output to MAX_STDERR', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, '{"type":"test"}');
      const tmpFile = path.join(sessionPath, `${sessionId}.agent-review.md.tmp`);

      const { mockProcess, mockStderr } = createMockCopilotProcess();
      const { mockReadStream } = setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      mockReadStream.pipe.mockImplementation((destination) => destination);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Emit large stderr output (> 64KB)
      const largeChunk = Buffer.alloc(70 * 1024, 'x'); // 70KB
      mockStderr.emit('data', largeChunk);
      mockStderr.emit('data', Buffer.from('This should be ignored'));

      await fs.writeFile(tmpFile, 'output');

      mockProcess.emit('close', 1);

      await new Promise(resolve => setTimeout(resolve, 50));

      consoleErrorSpy.mockRestore();
    });

    it('should handle copilot process spawn error', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, '{"type":"test"}');

      const { mockProcess } = createMockCopilotProcess();
      const { mockReadStream } = setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      mockReadStream.pipe.mockImplementation((destination) => destination);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate spawn error
      mockProcess.emit('error', new Error('Command not found'));

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Failed to spawn Copilot:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it('should handle error during finalization cleanup', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const eventsFile = path.join(sessionPath, 'events.jsonl');
      await fs.writeFile(eventsFile, '{"type":"test"}');

      const { mockProcess } = createMockCopilotProcess();
      const { mockReadStream } = setupFileMocks();
      spawn.mockReturnValue(mockProcess);

      mockReadStream.pipe.mockImplementation((destination) => destination);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Mock readFile to throw error during finalization
      const originalReadFile = fs.readFile.bind(fs);
      jest.spyOn(fs, 'readFile').mockImplementation(async (filePath, ...args) => {
        if (filePath.toString().includes(`${sessionId}.agent-review.md.tmp`)) {
          throw new Error('Read failed');
        }
        return originalReadFile(filePath, ...args);
      });

      await service.generateInsight(sessionId, sessionPath, 'copilot', false);

      await new Promise(resolve => setTimeout(resolve, 10));

      mockProcess.emit('close', 0);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error finalizing insight:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getInsightStatus', () => {
    it('should return completed status with report', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const insightFile = path.join(sessionPath, `${sessionId}.agent-review.md`);
      const reportContent = '# Test Report';
      await fs.writeFile(insightFile, reportContent);

      const result = await service.getInsightStatus(sessionId, sessionPath, 'copilot');

      expect(result.status).toBe('completed');
      expect(result.report).toBe(reportContent);
      expect(result.generatedAt).toBeDefined();
    });

    it('should return generating status with lock file', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const lockFile = path.join(sessionPath, `${sessionId}.agent-review.md.lock`);
      await fs.writeFile(lockFile, JSON.stringify({ sessionId }));

      const result = await service.getInsightStatus(sessionId, sessionPath, 'copilot');

      expect(result.status).toBe('generating');
      expect(result.startedAt).toBeDefined();
      expect(result.lastUpdate).toBeDefined();
      expect(result.ageMs).toBeGreaterThanOrEqual(-100); // allow small timing variance
    });

    it('should return generating status with live log', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const lockFile = path.join(sessionPath, `${sessionId}.agent-review.md.lock`);
      const tmpFile = path.join(sessionPath, `${sessionId}.agent-review.md.tmp`);
      await fs.writeFile(lockFile, JSON.stringify({ sessionId }));
      await fs.writeFile(tmpFile, 'Generating insight...');

      const result = await service.getInsightStatus(sessionId, sessionPath, 'copilot');

      expect(result.status).toBe('generating');
      expect(result.log).toBe('Generating insight...');
    });

    it('should return timeout status for stale generation', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const lockFile = path.join(sessionPath, `${sessionId}.agent-review.md.lock`);
      await fs.writeFile(lockFile, JSON.stringify({ sessionId }));

      // Mock fs.stat to return old birthtime (utimes doesn't change birthtime)
      const oldTime = Date.now() - config.INSIGHT_TIMEOUT_MS - 10000;
      const realStat = fs.stat;
      jest.spyOn(fs, 'stat').mockImplementation(async (filePath) => {
        const stats = await realStat(filePath);
        if (filePath === lockFile) {
          stats.birthtime = new Date(oldTime);
        }
        return stats;
      });

      const result = await service.getInsightStatus(sessionId, sessionPath, 'copilot');

      expect(result.status).toBe('timeout');
      expect(result.ageMs).toBeGreaterThan(config.INSIGHT_TIMEOUT_MS);

      fs.stat.mockRestore();
    });

    it('should return timeout status with log from tmp file', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const lockFile = path.join(sessionPath, `${sessionId}.agent-review.md.lock`);
      const tmpFile = path.join(sessionPath, `${sessionId}.agent-review.md.tmp`);
      await fs.writeFile(lockFile, JSON.stringify({ sessionId }));
      await fs.writeFile(tmpFile, 'Partial output before timeout');

      // Mock fs.stat to return old birthtime (utimes doesn't change birthtime)
      const oldTime = Date.now() - config.INSIGHT_TIMEOUT_MS - 10000;
      const realStat = fs.stat;
      jest.spyOn(fs, 'stat').mockImplementation(async (filePath) => {
        const stats = await realStat(filePath);
        if (filePath === lockFile) {
          stats.birthtime = new Date(oldTime);
        }
        return stats;
      });

      const result = await service.getInsightStatus(sessionId, sessionPath, 'copilot');

      expect(result.status).toBe('timeout');
      expect(result.log).toBe('Partial output before timeout');
      expect(result.ageMs).toBeGreaterThan(config.INSIGHT_TIMEOUT_MS);

      fs.stat.mockRestore();
    });

    it('should return not_started status when no insight exists', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      const result = await service.getInsightStatus(sessionId, sessionPath, 'copilot');

      expect(result.status).toBe('not_started');
    });

    it('should handle missing tmp file gracefully when generating', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const lockFile = path.join(sessionPath, `${sessionId}.agent-review.md.lock`);
      await fs.writeFile(lockFile, JSON.stringify({ sessionId }));
      // Don't create tmp file

      const result = await service.getInsightStatus(sessionId, sessionPath, 'copilot');

      expect(result.status).toBe('generating');
      expect(result.log).toBeNull();
    });
  });

  describe('deleteInsight', () => {
    it('should delete existing insight file', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const insightFile = path.join(sessionPath, `${sessionId}.agent-review.md`);
      await fs.writeFile(insightFile, '# Test Report');

      const result = await service.deleteInsight(sessionId, sessionPath, 'copilot');

      expect(result.success).toBe(true);
      await expect(fs.access(insightFile)).rejects.toThrow();
    });

    it('should return success for non-existent file', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      const result = await service.deleteInsight(sessionId, sessionPath, 'copilot');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Insight file not found');
    });

    it('should throw error for other failures', async () => {
      const sessionPath = path.join(tmpDir, sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      const insightFile = path.join(sessionPath, `${sessionId}.agent-review.md`);
      await fs.writeFile(insightFile, '# Test Report');

      // Mock unlink to throw non-ENOENT error
      const originalUnlink = fs.unlink.bind(fs);
      jest.spyOn(fs, 'unlink').mockImplementation(async (filePath) => {
        if (filePath.toString().includes(`${sessionId}.agent-review.md`)) {
          const err = new Error('Permission denied');
          err.code = 'EPERM';
          throw err;
        }
        return originalUnlink(filePath);
      });

      await expect(service.deleteInsight(sessionId, sessionPath, 'copilot')).rejects.toThrow('Permission denied');
    });
  });

  describe('_cleanReport', () => {
    it('should remove thinking blocks', () => {
      const report = `
# Report
<thinking>
This is internal thinking
</thinking>
Content here
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).not.toContain('<thinking>');
      expect(cleaned).not.toContain('This is internal thinking');
      expect(cleaned).toContain('Content here');
    });

    it('should remove multiple thinking blocks', () => {
      const report = `
# Report
<thinking>First block</thinking>
Content 1
<thinking>Second block</thinking>
Content 2
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).not.toContain('<thinking>');
      expect(cleaned).not.toContain('First block');
      expect(cleaned).not.toContain('Second block');
      expect(cleaned).toContain('Content 1');
      expect(cleaned).toContain('Content 2');
    });

    it('should remove thinking blocks with multiline content', () => {
      const report = `
## Report
<thinking>
Line 1 of thinking
Line 2 of thinking
Line 3 of thinking
</thinking>
Actual content
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).not.toContain('Line 1 of thinking');
      expect(cleaned).toContain('Actual content');
    });

    it('should remove meta-commentary lines', () => {
      const report = `
Let me analyze this session...
I'll analyze the data...
Analyzing the events...
Here's my analysis of the data
I need the session data first
## 🎯 Effectiveness Score: 85/100
The agent performed well.
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).not.toContain('Let me analyze');
      expect(cleaned).not.toContain("I'll analyze");
      expect(cleaned).not.toContain('Analyzing the events');
      expect(cleaned).not.toContain("Here's my analysis");
      expect(cleaned).not.toContain('I need the session');
      expect(cleaned).toContain('🎯 Effectiveness Score');
    });

    it('should extract report from copilot CLI output', () => {
      const report = `
● Tool call
  $ command
  └ 5 lines
(+10 lines)
## 🎯 Effectiveness Score: 90/100
Real report content here.
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).not.toContain('● Tool call');
      expect(cleaned).not.toContain('$ command');
      expect(cleaned).toContain('🎯 Effectiveness Score');
      expect(cleaned).toContain('Real report content here');
    });

    it('should handle multiple report attempts and use the last one', () => {
      const report = `
## 📊 Scorecard
First attempt (bad) 50/100
## 📋 System Prompt Compliance
More first attempt
## 📊 Scorecard
Second attempt (good) 90/100
## 📋 System Prompt Compliance
Second attempt details
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).toContain('90/100');
      expect(cleaned).toContain('Second attempt');
      expect(cleaned).not.toContain('First attempt');
    });

    it('should remove copilot CLI log patterns line by line as fallback', () => {
      const report = `
● Tool execution
  $ some command
  └ output here
Regular content
(+5 lines)
More regular content
  └ 10 lines
Final content
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).not.toContain('● Tool execution');
      expect(cleaned).toContain('Regular content');
      expect(cleaned).toContain('Final content');
    });

    it('should remove "Asked user" and "User responded" log lines', () => {
      const report = `
● Asked user: What should I do?
  └ User responded: Do this
Regular content
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).not.toContain('Asked user');
      expect(cleaned).not.toContain('User responded');
      expect(cleaned).toContain('Regular content');
    });

    it('should trim excessive whitespace', () => {
      const report = `
# Report


Content here


More content


      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).not.toContain('\n\n\n');
      expect(cleaned).toMatch(/# Report\n\nContent here\n\nMore content/);
    });

    it('should handle report with only effectiveness score emoji', () => {
      const report = `
Some noise
● Tool
  $ cmd
More noise
## 📊 Scorecard
Content
## 📋 System Prompt Compliance
Analysis
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).toContain('📊 Scorecard');
      expect(cleaned).toContain('📋 System Prompt Compliance');
      expect(cleaned).not.toContain('Some noise');
    });

    it('should handle report with any markdown heading emoji', () => {
      const report = `
Noise here
## 🔄 Workflow & Strategy
Good content
## ⚡ Performance
More content
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).toContain('🔄 Workflow');
      expect(cleaned).toContain('⚡ Performance');
      expect(cleaned).not.toContain('Noise here');
    });

    it('should handle report with plain markdown headings', () => {
      const report = `
Noise
## Analysis Results
Content here
### Details
More content
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).toContain('Analysis Results');
      expect(cleaned).toContain('Details');
    });

    it('should handle empty report', () => {
      const report = '';

      const cleaned = service._cleanReport(report);

      expect(cleaned).toBe('');
    });

    it('should handle report with only noise', () => {
      const report = `
● Tool call
  $ command
  └ output
(+5 lines)
      `.trim();

      const cleaned = service._cleanReport(report);

      // Should remove all noise
      expect(cleaned.length).toBeLessThan(report.length);
    });

    it('should preserve code blocks in report', () => {
      const report = `
## 🎯 Effectiveness Score: 80/100
Analysis shows issues:
\`\`\`
Error code: 500
Stack trace here
\`\`\`
More content
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).toContain('```');
      expect(cleaned).toContain('Error code: 500');
      expect(cleaned).toContain('Stack trace here');
    });

    it('should handle mixed content with CLI logs and report', () => {
      const report = `
● Read tool
  $ cat events.jsonl
  └ 100 lines
(+100 lines)
● Write tool
  $ write output.md
  └ Success
## 🎯 Effectiveness Score: 95/100
Excellent performance
## 🔧 Tool Usage Analysis
- Good tool selection
- Efficient execution
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).toContain('🎯 Effectiveness Score: 95/100');
      expect(cleaned).toContain('Good tool selection');
      expect(cleaned).not.toContain('● Read tool');
      expect(cleaned).not.toContain('$ cat events.jsonl');
    });

    it('should handle skip block logic correctly', () => {
      const report = `
● Tool
  Some indented content
    More indented
Regular line here
      `.trim();

      const cleaned = service._cleanReport(report);

      expect(cleaned).toContain('Regular line here');
    });
  });

  describe('_buildPrompt', () => {
    it('should build a prompt with correct structure', () => {
      const insightFile = path.join(tmpDir, sessionId, `${sessionId}.agent-review.md`);
      const eventsFile = path.join(tmpDir, sessionId, 'events.jsonl');
      const prompt = service._buildPrompt(insightFile, eventsFile);

      expect(prompt).toContain('expert AI agent prompt-compliance auditor');
      expect(prompt).toContain('Step 1 — Discover session files');
      expect(prompt).toContain('Step 2 — Extract prompts');
      expect(prompt).toContain('Step 3 — Spawn 3 sub-agents');
      expect(prompt).toContain('Step 4 — Synthesize the final report');
      expect(prompt).toContain('Prompt Compliance Analyst');
      expect(prompt).toContain('Task Completion Analyst');
      expect(prompt).toContain('Build & Test Analyst');
      expect(prompt).toContain('📊 Scorecard');
      expect(prompt).toContain('🔨 Build & Test Results');
      expect(prompt).toContain('📋 System Prompt Compliance');
      expect(prompt).toContain('🎯 User Ask Alignment');
      expect(prompt).toContain('💡 Key Findings');
      expect(prompt).toContain(path.dirname(insightFile));
    });

    it('should include correct file paths', () => {
      const insightFile = path.join(tmpDir, sessionId, `${sessionId}.agent-review.md`);
      const eventsFile = path.join(tmpDir, sessionId, 'events.jsonl');
      const prompt = service._buildPrompt(insightFile, eventsFile);

      const sessionDir = path.dirname(insightFile);
      const workDir = `${sessionDir}/.output`;

      expect(prompt).toContain(workDir);
      expect(prompt).toContain('mkdir -p');
      expect(prompt).toContain('events.jsonl');
      expect(prompt).toContain('plan.md');
      expect(prompt).toContain('workspace.yaml');
    });

    it('should include output file paths for sub-agents', () => {
      const insightFile = path.join(tmpDir, sessionId, `${sessionId}.agent-review.md`);
      const eventsFile = path.join(tmpDir, sessionId, 'events.jsonl');
      const prompt = service._buildPrompt(insightFile, eventsFile);

      expect(prompt).toContain('compliance.md');
      expect(prompt).toContain('task.md');
      expect(prompt).toContain('buildtest.md');
    });

    it('should specify final output path', () => {
      const insightFile = path.join(tmpDir, sessionId, `${sessionId}.agent-review.md`);
      const eventsFile = path.join(tmpDir, sessionId, 'events.jsonl');
      const prompt = service._buildPrompt(insightFile, eventsFile);

      expect(prompt).toContain(insightFile);
    });

    it('should include analysis requirements', () => {
      const insightFile = path.join(tmpDir, sessionId, `${sessionId}.agent-review.md`);
      const eventsFile = path.join(tmpDir, sessionId, 'events.jsonl');
      const prompt = service._buildPrompt(insightFile, eventsFile);

      expect(prompt).toContain('system prompt rules/constraints');
      expect(prompt).toContain('user\'s ask');
      expect(prompt).toContain('exit code');
      expect(prompt).toContain('root cause');
      expect(prompt).toContain('evidence from the session trace');
    });

    it('should include character limit constraint', () => {
      const insightFile = path.join(tmpDir, sessionId, `${sessionId}.agent-review.md`);
      const eventsFile = path.join(tmpDir, sessionId, 'events.jsonl');
      const prompt = service._buildPrompt(insightFile, eventsFile);

      expect(prompt).toContain('4000 characters');
    });

    it('should emphasize waiting for all sub-agents', () => {
      const insightFile = path.join(tmpDir, sessionId, `${sessionId}.agent-review.md`);
      const eventsFile = path.join(tmpDir, sessionId, 'events.jsonl');
      const prompt = service._buildPrompt(insightFile, eventsFile);

      expect(prompt).toContain('CRITICAL: You MUST wait for ALL 3 sub-agents');
      expect(prompt).toContain('Do NOT move on until every sub-agent has returned');
    });

    it('should include cleanup instructions', () => {
      const insightFile = path.join(tmpDir, sessionId, `${sessionId}.agent-review.md`);
      const eventsFile = path.join(tmpDir, sessionId, 'events.jsonl');
      const prompt = service._buildPrompt(insightFile, eventsFile);

      expect(prompt).toContain('rm -rf');
      expect(prompt).toContain('.output');
    });

    it('should use dynamic events filename', () => {
      const insightFile = path.join(tmpDir, sessionId, `${sessionId}.agent-review.md`);
      const eventsFile = path.join(tmpDir, sessionId, '2026-01-01T00-00-00-000Z_abc123.jsonl');
      const prompt = service._buildPrompt(insightFile, eventsFile);

      expect(prompt).toContain('2026-01-01T00-00-00-000Z_abc123.jsonl');
      expect(prompt).not.toContain('events.jsonl');
    });
  });
});
