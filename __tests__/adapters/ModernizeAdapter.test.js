const fs = require('fs');
const path = require('path');
const os = require('os');
const ModernizeAdapter = require('../../src/adapters/ModernizeAdapter');

describe('ModernizeAdapter', () => {
  let adapter;
  let tmpDir;

  beforeEach(async () => {
    adapter = new ModernizeAdapter();
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'modernize-adapter-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    delete process.env.MODERNIZE_SESSION_DIR;
  });

  describe('identity', () => {
    it('should have type "modernize"', () => {
      expect(adapter.type).toBe('modernize');
    });

    it('should have displayName "Modernize"', () => {
      expect(adapter.displayName).toBe('Modernize');
    });

    it('should have envVar "MODERNIZE_SESSION_DIR"', () => {
      expect(adapter.envVar).toBe('MODERNIZE_SESSION_DIR');
    });

    it('should have badgeClass "source-modernize"', () => {
      expect(adapter.badgeClass).toBe('source-modernize');
    });

    it('should return correct displayMetadata', () => {
      expect(adapter.displayMetadata).toEqual({
        name: 'Modernize',
        badgeClass: 'source-modernize'
      });
    });
  });

  describe('getDefaultDir()', () => {
    it('should return the modernize configuration path', () => {
      const expected = path.join(os.homedir(), '.modernize', 'configuration');
      expect(adapter.getDefaultDir()).toBe(expected);
    });
  });

  describe('_extractModernizeVersion()', () => {
    it('should extract version from version+hash/session-state path', () => {
      const dir = path.join(tmpDir, '0.0.226+e9248086775020529cd2e546714e035e5f42ef87', 'session-state');
      expect(adapter._extractModernizeVersion(dir)).toBe('0.0.226');
    });

    it('should return null when no + in parent directory name', () => {
      const dir = path.join(tmpDir, 'some-other-dir', 'session-state');
      expect(adapter._extractModernizeVersion(dir)).toBeNull();
    });

    it('should handle short version strings', () => {
      const dir = path.join(tmpDir, '1.0.0+abc', 'session-state');
      expect(adapter._extractModernizeVersion(dir)).toBe('1.0.0');
    });
  });

  describe('resolveDir()', () => {
    it('should use env var when set', async () => {
      process.env.MODERNIZE_SESSION_DIR = '/custom/modernize/path';
      const result = await adapter.resolveDir();
      expect(result).toBe('/custom/modernize/path');
    });

    it('should return the configuration directory when no env var', async () => {
      const expected = path.join(os.homedir(), '.modernize', 'configuration');
      const result = await adapter.resolveDir();
      expect(result).toBe(expected);
    });
  });

  describe('_findSessionStateDirs()', () => {
    it('should return empty array when config dir does not exist', async () => {
      const result = await adapter._findSessionStateDirs(path.join(tmpDir, 'nonexistent'));
      expect(result).toEqual([]);
    });

    it('should return empty array when no version+hash directories exist', async () => {
      const configDir = path.join(tmpDir, 'configuration');
      await fs.promises.mkdir(configDir, { recursive: true });
      // Create a directory without '+' in the name
      await fs.promises.mkdir(path.join(configDir, 'no-plus-sign'));

      const result = await adapter._findSessionStateDirs(configDir);
      expect(result).toEqual([]);
    });

    it('should find session-state dirs in all version+hash directories', async () => {
      const configDir = path.join(tmpDir, 'configuration');
      await fs.promises.mkdir(configDir, { recursive: true });

      // Create two version+hash directories with session-state
      const v1Dir = path.join(configDir, '0.0.100+aaa', 'session-state');
      const v2Dir = path.join(configDir, '0.0.226+bbb', 'session-state');
      await fs.promises.mkdir(v1Dir, { recursive: true });
      await fs.promises.mkdir(v2Dir, { recursive: true });

      const result = await adapter._findSessionStateDirs(configDir);
      expect(result).toHaveLength(2);
      expect(result).toContain(v1Dir);
      expect(result).toContain(v2Dir);
    });

    it('should skip version dirs without session-state', async () => {
      const configDir = path.join(tmpDir, 'configuration');
      await fs.promises.mkdir(configDir, { recursive: true });

      // Create version dir with session-state
      const v1Dir = path.join(configDir, '0.0.100+aaa', 'session-state');
      await fs.promises.mkdir(v1Dir, { recursive: true });

      // Create version dir without session-state
      await fs.promises.mkdir(path.join(configDir, '0.0.200+bbb'));

      const result = await adapter._findSessionStateDirs(configDir);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(v1Dir);
    });
  });

  describe('scanEntries()', () => {
    it('should scan sessions across multiple version directories', async () => {
      const configDir = path.join(tmpDir, 'configuration');

      // Create version 1 with a session
      const v1SessionState = path.join(configDir, '0.0.100+aaa', 'session-state');
      await fs.promises.mkdir(v1SessionState, { recursive: true });
      const v1Session = path.join(v1SessionState, 'session-v1');
      await fs.promises.mkdir(v1Session);
      await fs.promises.writeFile(
        path.join(v1Session, 'events.jsonl'),
        '{"type":"user.message","data":{"message":"from v1"},"timestamp":"2025-01-01T00:00:00Z"}\n'
      );

      // Create version 2 with a different session
      const v2SessionState = path.join(configDir, '0.0.226+bbb', 'session-state');
      await fs.promises.mkdir(v2SessionState, { recursive: true });
      const v2Session = path.join(v2SessionState, 'session-v2');
      await fs.promises.mkdir(v2Session);
      await fs.promises.writeFile(
        path.join(v2Session, 'events.jsonl'),
        '{"type":"user.message","data":{"message":"from v2"},"timestamp":"2025-02-01T00:00:00Z"}\n'
      );

      const sessions = await adapter.scanEntries(configDir);
      expect(sessions).toHaveLength(2);
      expect(sessions.every(s => s.source === 'modernize')).toBe(true);
      const ids = sessions.map(s => s.id).sort();
      expect(ids).toEqual(['session-v1', 'session-v2']);

      // Verify modernize versions extracted from directory paths
      const v1 = sessions.find(s => s.id === 'session-v1');
      const v2 = sessions.find(s => s.id === 'session-v2');
      expect(v1.modernizeVersion).toBe('0.0.100');
      expect(v2.modernizeVersion).toBe('0.0.226');
    });

    it('should scan .jsonl files across version directories', async () => {
      const configDir = path.join(tmpDir, 'configuration');
      const sessionState = path.join(configDir, '0.0.100+aaa', 'session-state');
      await fs.promises.mkdir(sessionState, { recursive: true });
      await fs.promises.writeFile(
        path.join(sessionState, 'session-file.jsonl'),
        '{"type":"user.message","data":{"message":"test"},"timestamp":"2025-01-01T00:00:00Z"}\n'
      );

      const sessions = await adapter.scanEntries(configDir);
      expect(sessions.length).toBeGreaterThanOrEqual(1);
      expect(sessions[0].source).toBe('modernize');
    });

    it('should scan directly when env var is set', async () => {
      const sessionStateDir = path.join(tmpDir, 'direct-session-state');
      await fs.promises.mkdir(sessionStateDir);
      const sessionDir = path.join(sessionStateDir, 'test-session');
      await fs.promises.mkdir(sessionDir);
      await fs.promises.writeFile(
        path.join(sessionDir, 'events.jsonl'),
        '{"type":"user.message","data":{"message":"test"},"timestamp":"2025-01-01T00:00:00Z"}\n'
      );

      process.env.MODERNIZE_SESSION_DIR = sessionStateDir;
      const sessions = await adapter.scanEntries(sessionStateDir);
      expect(sessions.length).toBeGreaterThanOrEqual(1);
      expect(sessions[0].source).toBe('modernize');
    });

    it('should return empty array when no version dirs have sessions', async () => {
      const configDir = path.join(tmpDir, 'configuration');
      await fs.promises.mkdir(configDir, { recursive: true });
      // Create version dir without session-state
      await fs.promises.mkdir(path.join(configDir, '0.0.1+abc'));

      const sessions = await adapter.scanEntries(configDir);
      expect(sessions).toEqual([]);
    });
  });

  describe('findById()', () => {
    it('should find session across version directories', async () => {
      const configDir = path.join(tmpDir, 'configuration');
      const sessionState = path.join(configDir, '0.0.100+aaa', 'session-state');
      await fs.promises.mkdir(sessionState, { recursive: true });

      const sessionDir = path.join(sessionState, 'target-session');
      await fs.promises.mkdir(sessionDir);
      await fs.promises.writeFile(
        path.join(sessionDir, 'events.jsonl'),
        '{"type":"user.message","data":{"message":"found"},"timestamp":"2025-01-01T00:00:00Z"}\n'
      );

      const session = await adapter.findById('target-session', configDir);
      expect(session).not.toBeNull();
      expect(session.id).toBe('target-session');
      expect(session.source).toBe('modernize');
      expect(session.modernizeVersion).toBe('0.0.100');
    });

    it('should return null when session not found in any version dir', async () => {
      const configDir = path.join(tmpDir, 'configuration');
      const sessionState = path.join(configDir, '0.0.100+aaa', 'session-state');
      await fs.promises.mkdir(sessionState, { recursive: true });

      const session = await adapter.findById('nonexistent', configDir);
      expect(session).toBeNull();
    });

    it('should find session directly when env var is set', async () => {
      const sessionStateDir = path.join(tmpDir, 'direct');
      await fs.promises.mkdir(sessionStateDir);
      const sessionDir = path.join(sessionStateDir, 'my-session');
      await fs.promises.mkdir(sessionDir);
      await fs.promises.writeFile(
        path.join(sessionDir, 'events.jsonl'),
        '{"type":"user.message","data":{"message":"direct"},"timestamp":"2025-01-01T00:00:00Z"}\n'
      );

      process.env.MODERNIZE_SESSION_DIR = sessionStateDir;
      const session = await adapter.findById('my-session', sessionStateDir);
      expect(session).not.toBeNull();
      expect(session.source).toBe('modernize');
    });
  });

  describe('resolveEventsFile()', () => {
    it('should resolve events file across version directories', async () => {
      const configDir = path.join(tmpDir, 'configuration');
      const sessionState = path.join(configDir, '0.0.100+aaa', 'session-state');
      await fs.promises.mkdir(sessionState, { recursive: true });

      const sessionDir = path.join(sessionState, 'ev-session');
      await fs.promises.mkdir(sessionDir);
      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, '{"type":"user.message"}\n');

      const mockSession = { id: 'ev-session', source: 'modernize' };
      const result = await adapter.resolveEventsFile(mockSession, configDir);
      expect(result).toBe(eventsFile);
    });

    it('should return null when events file not found in any version dir', async () => {
      const configDir = path.join(tmpDir, 'configuration');
      const sessionState = path.join(configDir, '0.0.100+aaa', 'session-state');
      await fs.promises.mkdir(sessionState, { recursive: true });

      const mockSession = { id: 'missing', source: 'modernize' };
      const result = await adapter.resolveEventsFile(mockSession, configDir);
      expect(result).toBeNull();
    });
  });

  describe('session source tagging', () => {
    it('should tag directory sessions with source "modernize"', async () => {
      const sessionDir = path.join(tmpDir, 'test-session');
      await fs.promises.mkdir(sessionDir);
      await fs.promises.writeFile(
        path.join(sessionDir, 'events.jsonl'),
        '{"type":"user.message","data":{"message":"hello"},"timestamp":"2025-01-01T00:00:00Z"}\n'
      );

      const stats = await fs.promises.stat(sessionDir);
      const session = await adapter._createDirectorySession('test-session', sessionDir, stats);
      expect(session).not.toBeNull();
      expect(session.source).toBe('modernize');
    });

    it('should tag file sessions with source "modernize"', async () => {
      const filePath = path.join(tmpDir, 'test-session.jsonl');
      await fs.promises.writeFile(
        filePath,
        '{"type":"user.message","data":{"message":"hello"},"timestamp":"2025-01-01T00:00:00Z"}\n'
      );

      const stats = await fs.promises.stat(filePath);
      const session = await adapter._createFileSession('test-session.jsonl', filePath, stats);
      expect(session).not.toBeNull();
      expect(session.source).toBe('modernize');
    });
  });
});

