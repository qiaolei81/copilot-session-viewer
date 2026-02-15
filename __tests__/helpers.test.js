const { buildMetadata, isValidSessionId } = require('../src/utils/helpers');

describe('helpers', () => {
  describe('buildMetadata', () => {
    it('should build metadata from session object', () => {
      const mockSession = {
        type: 'directory',
        summary: 'Test session summary',
        model: 'claude-3-sonnet',
        workspace: {
          repository: 'test-repo',
          branch: 'main',
          cwd: '/test/path'
        },
        createdAt: '2026-02-15T10:00:00Z',
        updatedAt: '2026-02-15T12:00:00Z',
        copilotVersion: '1.0.0'
      };

      const metadata = buildMetadata(mockSession);

      expect(metadata).toEqual({
        type: 'directory',
        summary: 'Test session summary',
        model: 'claude-3-sonnet',
        repo: 'test-repo',
        branch: 'main',
        cwd: '/test/path',
        created: '2026-02-15T10:00:00Z',
        updated: '2026-02-15T12:00:00Z',
        copilotVersion: '1.0.0'
      });
    });

    it('should handle session with minimal data', () => {
      const mockSession = {
        type: 'file',
        summary: 'Legacy session',
        createdAt: '2026-02-15T10:00:00Z',
        updatedAt: '2026-02-15T12:00:00Z'
      };

      const metadata = buildMetadata(mockSession);

      expect(metadata).toEqual({
        type: 'file',
        summary: 'Legacy session',
        model: undefined,
        repo: undefined,
        branch: undefined,
        cwd: undefined,
        created: '2026-02-15T10:00:00Z',
        updated: '2026-02-15T12:00:00Z',
        copilotVersion: undefined
      });
    });

    it('should handle session with null workspace', () => {
      const mockSession = {
        type: 'directory',
        summary: 'Test session',
        workspace: null,
        createdAt: '2026-02-15T10:00:00Z',
        updatedAt: '2026-02-15T12:00:00Z'
      };

      const metadata = buildMetadata(mockSession);

      expect(metadata.repo).toBeUndefined();
      expect(metadata.branch).toBeUndefined();
      expect(metadata.cwd).toBeUndefined();
    });
  });

  describe('isValidSessionId', () => {
    it('should accept valid session IDs', () => {
      const validIds = [
        'abc123',
        'session-123',
        'test_session',
        'ABC-123_test',
        '123456789',
        'a',
        'A-Z_0-9'
      ];

      validIds.forEach(id => {
        expect(isValidSessionId(id)).toBe(true);
      });
    });

    it('should reject invalid characters', () => {
      const invalidIds = [
        'session.id',        // dot
        'session/id',        // slash
        'session\\id',       // backslash
        'session id',        // space
        'session@id',        // at symbol
        'session#id',        // hash
        'session$id',        // dollar
        'session%id',        // percent
        'session&id',        // ampersand
        'session*id',        // asterisk
        'session(id)',       // parentheses
        'session[id]',       // brackets
        'session{id}',       // braces
        'session|id',        // pipe
        'session;id',        // semicolon
        'session:id',        // colon
        'session"id"',       // quotes
        "session'id'",       // single quotes
        'session<id>',       // angle brackets
        'session?id',        // question mark
        'session!id',        // exclamation
        'session+id',        // plus
        'session=id',        // equals
        'session~id',        // tilde
        'session`id'         // backtick
      ];

      invalidIds.forEach(id => {
        expect(isValidSessionId(id)).toBe(false);
      });
    });

    it('should reject empty or undefined input', () => {
      expect(isValidSessionId('')).toBe(false);
      expect(isValidSessionId(null)).toBe(false);
      expect(isValidSessionId(undefined)).toBe(false);
    });

    it('should reject IDs that are too long', () => {
      const longId = 'a'.repeat(256); // Exceeds 255 character limit
      expect(isValidSessionId(longId)).toBe(false);
    });

    it('should accept IDs at the length limit', () => {
      const maxLengthId = 'a'.repeat(255); // Exactly 255 characters
      expect(isValidSessionId(maxLengthId)).toBe(true);
    });

    it('should reject non-string input', () => {
      expect(isValidSessionId(123)).toBe(false);
      expect(isValidSessionId({})).toBe(false);
      expect(isValidSessionId([])).toBe(false);
      expect(isValidSessionId(true)).toBe(false);
    });

    it('should handle Unicode characters', () => {
      const unicodeIds = [
        'session-ñ',         // Unicode character
        'session-中文',       // Chinese characters
        'session-🚀',        // Emoji
        'session-é'          // Accented character
      ];

      unicodeIds.forEach(id => {
        expect(isValidSessionId(id)).toBe(false);
      });
    });

    it('should prevent path traversal attempts', () => {
      const maliciousIds = [
        '../session',
        '../../etc/passwd',
        '..',
        '.',
        './session',
        '../../../secret',
        'session/../other',
        '..\\session',        // Windows path
        '.\\session',         // Windows path
        'C:\\session',        // Absolute Windows path
        '/etc/passwd',        // Absolute Unix path
        '~/session',          // Home directory
        '$HOME/session'       // Environment variable
      ];

      maliciousIds.forEach(id => {
        expect(isValidSessionId(id)).toBe(false);
      });
    });
  });
});