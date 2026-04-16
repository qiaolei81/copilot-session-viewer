'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock dependencies
jest.mock('../../src/utils/fileUtils', () => ({
  fileExists: jest.fn(),
  countLines: jest.fn().mockResolvedValue(5),
  parseYAML: jest.fn().mockResolvedValue(null),
  getSessionMetadataOptimized: jest.fn(),
  shouldSkipEntry: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/adapters/adapterUtils', () => ({
  computeSessionStatus: jest.fn().mockReturnValue('completed'),
}));

const { fileExists, parseYAML, getSessionMetadataOptimized } = require('../../src/utils/fileUtils');
const CopilotAdapter = require('../../src/adapters/CopilotAdapter');

describe('CopilotAdapter - _createDirectorySession', () => {
  let adapter;
  let tmpDir;

  beforeEach(() => {
    adapter = new CopilotAdapter('/fake/sessions');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-adapter-test-'));

    // Default mocks
    fileExists.mockResolvedValue(false);
    parseYAML.mockResolvedValue(null);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  /**
   * Regression test for issue #9:
   * "NaN/NaN/NaN date header for sessions without workspace.yaml —
   *  spreading fs.Stats loses birthtime getter"
   *
   * When lastEventTime > stats.mtime, CopilotAdapter does:
   *   stats = { ...stats, mtime: new Date(lastEventMs) }
   * fs.Stats.birthtime is a prototype getter (not own property),
   * so spread loses it → Session.createdAt becomes undefined →
   * formatDateHeader() renders "NaN/NaN/NaN".
   */
  describe('birthtime preservation after stats spread (issue #9)', () => {
    function makeFakeStats(birthtimeDate, mtimeDate) {
      // Simulate real fs.Stats: birthtime is a prototype getter, birthtimeMs is own property
      const proto = {
        get birthtime() {
          return this._birthtime;
        },
      };
      const stats = Object.create(proto);
      stats._birthtime = birthtimeDate;
      stats.birthtimeMs = birthtimeDate.getTime();
      stats.mtime = mtimeDate;
      stats.mtimeMs = mtimeDate.getTime();
      stats.isDirectory = () => true;
      return stats;
    }

    test('birthtime is preserved when lastEventTime > stats.mtime (spread scenario)', async () => {
      const birthtime = new Date('2026-01-01T00:00:00Z');
      const mtime = new Date('2026-04-16T10:00:00.000Z');
      const lastEventTime = new Date('2026-04-16T10:00:00.001Z').toISOString(); // 1ms later

      const stats = makeFakeStats(birthtime, mtime);

      // Confirm prototype getter behavior (proves the bug exists without fix)
      expect(stats.birthtime).toEqual(birthtime);
      const spread = { ...stats };
      expect(spread.birthtime).toBeUndefined(); // spread loses getter

      getSessionMetadataOptimized.mockResolvedValue({
        lastEventTime,
        firstUserMessage: 'hello',
        eventCount: 3,
        duration: 1000,
      });

      const session = await adapter._createDirectorySession(
        'test-session-id',
        tmpDir,
        stats
      );

      // createdAt must be a valid Date, not undefined/NaN
      expect(session.createdAt).toBeDefined();
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(isNaN(session.createdAt.getTime())).toBe(false);
      expect(session.createdAt).toEqual(birthtime);
    });

    test('birthtime is intact when lastEventTime <= stats.mtime (no spread triggered)', async () => {
      const birthtime = new Date('2026-01-01T00:00:00Z');
      const mtime = new Date('2026-04-16T10:00:01.000Z');
      const lastEventTime = new Date('2026-04-16T10:00:00.000Z').toISOString(); // older than mtime

      const stats = makeFakeStats(birthtime, mtime);

      getSessionMetadataOptimized.mockResolvedValue({
        lastEventTime,
        firstUserMessage: 'hello',
        eventCount: 3,
        duration: 1000,
      });

      const session = await adapter._createDirectorySession(
        'test-session-id',
        tmpDir,
        stats
      );

      expect(session.createdAt).toEqual(birthtime);
    });

    test('birthtimeMs is preserved after spread as a fallback', () => {
      // Verify own-property behavior: birthtimeMs survives spread even if birthtime does not
      const birthtime = new Date('2026-03-15T08:30:00Z');
      const mtime = new Date('2026-04-16T10:00:00Z');

      const proto = { get birthtime() { return this._birthtime; } };
      const stats = Object.create(proto);
      stats._birthtime = birthtime;
      stats.birthtimeMs = birthtime.getTime();
      stats.mtime = mtime;

      const spread = { ...stats };
      expect(spread.birthtime).toBeUndefined();          // getter lost
      expect(spread.birthtimeMs).toBe(birthtime.getTime()); // own prop preserved

      // After fix: explicitly carry birthtime
      const fixed = { ...stats, mtime: new Date(), birthtime: stats.birthtime };
      expect(fixed.birthtime).toEqual(birthtime);
    });
  });
});
