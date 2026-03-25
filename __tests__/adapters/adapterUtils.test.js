const fs = require('fs');
const path = require('path');
const os = require('os');
const { readFirstLine, computeSessionStatus } = require('../../src/adapters/adapterUtils');

describe('adapterUtils', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'adapter-utils-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('readFirstLine()', () => {
    it('should return first line of a file', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(filePath, 'first line\nsecond line\nthird line');

      const result = await readFirstLine(filePath);
      expect(result).toBe('first line');
    });

    it('should trim whitespace from first line', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(filePath, '  hello world  \nsecond');

      const result = await readFirstLine(filePath);
      expect(result).toBe('hello world');
    });

    it('should return the line for single-line files', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(filePath, 'only line');

      const result = await readFirstLine(filePath);
      expect(result).toBe('only line');
    });

    it('should return null for empty files', async () => {
      const filePath = path.join(tmpDir, 'empty.txt');
      await fs.promises.writeFile(filePath, '');

      const result = await readFirstLine(filePath);
      expect(result).toBeNull();
    });

    it('should handle JSON content', async () => {
      const filePath = path.join(tmpDir, 'test.jsonl');
      const jsonLine = JSON.stringify({ type: 'session', timestamp: '2026-01-01' });
      await fs.promises.writeFile(filePath, jsonLine + '\n' + JSON.stringify({ type: 'event' }));

      const result = await readFirstLine(filePath);
      expect(JSON.parse(result)).toEqual({ type: 'session', timestamp: '2026-01-01' });
    });

    it('should reject for non-existent files', async () => {
      const filePath = path.join(tmpDir, 'nonexistent.txt');

      await expect(readFirstLine(filePath)).rejects.toThrow();
    });

    it('should handle Windows-style line endings (CRLF)', async () => {
      const filePath = path.join(tmpDir, 'crlf.txt');
      await fs.promises.writeFile(filePath, 'first\r\nsecond\r\nthird');

      const result = await readFirstLine(filePath);
      expect(result).toBe('first');
    });
  });

  describe('computeSessionStatus()', () => {
    it('should return completed when hasSessionEnd is true', () => {
      const result = computeSessionStatus({
        hasSessionEnd: true,
        lastEventTime: Date.now() // even if recent
      });
      expect(result).toBe('completed');
    });

    it('should return wip when no session end and last event is recent', () => {
      const result = computeSessionStatus({
        hasSessionEnd: false,
        lastEventTime: Date.now() - 1000 // 1 second ago
      });
      expect(result).toBe('wip');
    });

    it('should return completed when no session end but last event is old', () => {
      const result = computeSessionStatus({
        hasSessionEnd: false,
        lastEventTime: Date.now() - 10 * 60 * 1000 // 10 minutes ago
      });
      expect(result).toBe('completed');
    });

    it('should return completed when lastEventTime is null', () => {
      const result = computeSessionStatus({
        hasSessionEnd: false,
        lastEventTime: null
      });
      expect(result).toBe('completed');
    });

    it('should return completed when lastEventTime is undefined', () => {
      const result = computeSessionStatus({
        hasSessionEnd: false
      });
      expect(result).toBe('completed');
    });

    it('should use 5-minute threshold for wip detection', () => {
      const justUnder5Min = Date.now() - (4 * 60 * 1000 + 59 * 1000);
      expect(computeSessionStatus({
        hasSessionEnd: false,
        lastEventTime: justUnder5Min
      })).toBe('wip');

      const justOver5Min = Date.now() - (5 * 60 * 1000 + 1000);
      expect(computeSessionStatus({
        hasSessionEnd: false,
        lastEventTime: justOver5Min
      })).toBe('completed');
    });
  });
});

