const Session = require('../src/session');

describe('Session', () => {
  describe('constructor', () => {
    it('should create a session with basic properties', () => {
      const session = new Session('test-id', 'directory', {
        summary: 'Test session',
        eventCount: 10
      });
      
      expect(session.id).toBe('test-id');
      expect(session.type).toBe('directory');
      expect(session.summary).toBe('Test session');
      expect(session.eventCount).toBe(10);
    });

    it('should use default summary for file type', () => {
      const session = new Session('test-id', 'file');
      expect(session.summary).toBe('Legacy session');
    });

    it('should use default summary for directory type', () => {
      const session = new Session('test-id', 'directory');
      expect(session.summary).toBe('No summary');
    });
  });

  describe('fromDirectory', () => {
    it('should create session from directory metadata', () => {
      const stats = {
        birthtime: new Date('2024-01-01'),
        mtime: new Date('2024-01-02')
      };
      const workspace = {
        summary: 'Test workspace',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      };
      
      const session = Session.fromDirectory('/path', 'test-id', stats, workspace, 5);
      
      expect(session.id).toBe('test-id');
      expect(session.type).toBe('directory');
      expect(session.summary).toBe('Test workspace');
      expect(session.eventCount).toBe(5);
      expect(session.hasEvents).toBe(true);
    });

    it('should use stats dates when workspace dates are missing', () => {
      const stats = {
        birthtime: new Date('2024-01-01'),
        mtime: new Date('2024-01-02')
      };
      
      const session = Session.fromDirectory('/path', 'test-id', stats, {}, 0);
      
      expect(session.createdAt).toEqual(stats.birthtime);
      expect(session.updatedAt).toEqual(stats.mtime);
      expect(session.hasEvents).toBe(false);
    });
  });

  describe('fromFile', () => {
    it('should create session from file metadata', () => {
      const stats = {
        birthtime: new Date('2024-01-01'),
        mtime: new Date('2024-01-02')
      };
      
      const session = Session.fromFile('/path/test.jsonl', 'test-id', stats, 10);
      
      expect(session.id).toBe('test-id');
      expect(session.type).toBe('file');
      expect(session.summary).toBe('Legacy session');
      expect(session.eventCount).toBe(10);
      expect(session.hasEvents).toBe(true);
    });
  });

  describe('toJSON', () => {
    it('should convert session to plain object', () => {
      const session = new Session('test-id', 'directory', {
        workspace: { repo: 'test' },
        summary: 'Test',
        eventCount: 5
      });
      
      const json = session.toJSON();
      
      expect(json).toEqual({
        id: 'test-id',
        type: 'directory',
        workspace: { repo: 'test' },
        createdAt: undefined,
        updatedAt: undefined,
        summary: 'Test',
        hasEvents: false,
        eventCount: 5,
        duration: null,
        isImported: false,
        hasInsight: false,
        copilotVersion: null,
        selectedModel: null
      });
    });
  });
});
