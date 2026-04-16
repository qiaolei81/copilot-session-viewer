'use strict';

const Session = require('../../src/models/Session');

describe('Session - birthtime fallback via birthtimeMs (issue #9)', () => {
  /**
   * Regression test for issue #9:
   * "NaN/NaN/NaN date header for sessions without workspace.yaml —
   *  spreading fs.Stats loses birthtime getter"
   *
   * fs.Stats.birthtime is a prototype getter (not own property).
   * After { ...stats }, birthtime becomes undefined.
   * Session must fall back to birthtimeMs (own property, survives spread).
   */

  function makeSpreadStats(birthtimeMs, mtimeDate) {
    // Simulates fs.Stats after spread: birthtimeMs present, birthtime lost
    return {
      birthtime: undefined,
      birthtimeMs,
      mtime: mtimeDate,
      mtimeMs: mtimeDate.getTime(),
    };
  }

  describe('Session.fromDirectory', () => {
    test('falls back to birthtimeMs when birthtime is lost after spread', () => {
      const birthtimeMs = new Date('2026-01-15T08:00:00Z').getTime();
      const stats = makeSpreadStats(birthtimeMs, new Date('2026-04-16T10:00:00Z'));

      const session = Session.fromDirectory('/fake/path', 'test-id', stats, null, 0, 0, false, false, null, null, 'completed');

      expect(session.createdAt).toBeInstanceOf(Date);
      expect(isNaN(session.createdAt.getTime())).toBe(false);
      expect(session.createdAt.getTime()).toBe(birthtimeMs);
    });

    test('prefers birthtime when available (normal fs.Stats, no spread)', () => {
      const birthtime = new Date('2026-02-01T00:00:00Z');
      const stats = { birthtime, birthtimeMs: birthtime.getTime(), mtime: new Date() };

      const session = Session.fromDirectory('/fake/path', 'test-id', stats, null, 0, 0, false, false, null, null, 'completed');

      expect(session.createdAt).toEqual(birthtime);
    });

    test('prefers workspace.created_at over stats birthtime', () => {
      const stats = makeSpreadStats(new Date('2026-01-01').getTime(), new Date());
      const workspace = { created_at: '2026-03-10T12:00:00Z' };

      const session = Session.fromDirectory('/fake/path', 'test-id', stats, workspace, 0, 0, false, false, null, null, 'completed');

      expect(session.createdAt).toEqual(new Date('2026-03-10T12:00:00Z'));
    });
  });

  describe('Session.fromFile', () => {
    test('falls back to birthtimeMs when birthtime is lost after spread', () => {
      const birthtimeMs = new Date('2026-02-20T06:00:00Z').getTime();
      const stats = makeSpreadStats(birthtimeMs, new Date('2026-04-16T10:00:00Z'));

      const session = Session.fromFile('/fake/file.jsonl', 'test-id', stats, 5, 'summary', 1000, null, null, 'completed');

      expect(session.createdAt).toBeInstanceOf(Date);
      expect(isNaN(session.createdAt.getTime())).toBe(false);
      expect(session.createdAt.getTime()).toBe(birthtimeMs);
    });
  });

  describe('sanity: spread loses prototype getter', () => {
    test('confirms birthtime getter is lost after spread but birthtimeMs survives', () => {
      const proto = { get birthtime() { return this._birth; } };
      const stats = Object.create(proto);
      stats._birth = new Date('2026-01-01');
      stats.birthtimeMs = stats._birth.getTime();

      expect(stats.birthtime).toBeDefined();
      const spread = { ...stats };
      expect(spread.birthtime).toBeUndefined();    // getter lost
      expect(spread.birthtimeMs).toBeDefined();    // own prop survives
    });
  });
});
