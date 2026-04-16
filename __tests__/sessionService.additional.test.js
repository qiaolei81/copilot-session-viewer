const fs = require('fs');
const path = require('path');
const os = require('os');
const SessionService = require('../src/services/sessionService');
const SessionRepository = require('../src/services/sessionRepository');

// Mock dependencies
jest.mock('../src/services/sessionRepository');

describe('SessionService - Additional Coverage', () => {
  let service;
  let tmpDir;
  let mockRepository;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'session-service-test-'));

    // Mock SessionRepository
    mockRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      sources: [
        { type: 'copilot', dir: path.join(tmpDir, 'copilot') },
        { type: 'claude', dir: path.join(tmpDir, 'claude') }
      ]
    };
    SessionRepository.mockImplementation(() => mockRepository);

    service = new SessionService(tmpDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getAllSessions', () => {
    it('should return sessions as JSON', async () => {
      const mockSession = {
        id: 'test-id',
        toJSON: jest.fn().mockReturnValue({ id: 'test-id', summary: 'Test' })
      };
      mockRepository.findAll.mockResolvedValue([mockSession]);

      const result = await service.getAllSessions();

      expect(result).toEqual([{ id: 'test-id', summary: 'Test' }]);
      expect(mockSession.toJSON).toHaveBeenCalled();
    });

    it('should handle empty session list', async () => {
      mockRepository.findAll.mockResolvedValue([]);

      const result = await service.getAllSessions();

      expect(result).toEqual([]);
    });

    it('should handle multiple sessions', async () => {
      const mockSessions = [
        { id: '1', toJSON: () => ({ id: '1' }) },
        { id: '2', toJSON: () => ({ id: '2' }) },
        { id: '3', toJSON: () => ({ id: '3' }) }
      ];
      mockRepository.findAll.mockResolvedValue(mockSessions);

      const result = await service.getAllSessions();

      expect(result).toHaveLength(3);
    });
  });

  describe('getPaginatedSessions', () => {
    beforeEach(() => {
      const mockSessions = Array.from({ length: 50 }, (_, i) => ({
        id: `session-${i}`,
        toJSON: () => ({ id: `session-${i}`, index: i })
      }));
      mockRepository.findAll.mockResolvedValue(mockSessions);
    });

    it('should return first page with default limit', async () => {
      const result = await service.getPaginatedSessions(1, 20);

      expect(result.sessions).toHaveLength(20);
      expect(result.currentPage).toBe(1);
      expect(result.totalSessions).toBe(50);
      expect(result.totalPages).toBe(3);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPrevPage).toBe(false);
    });

    it('should return second page correctly', async () => {
      const result = await service.getPaginatedSessions(2, 20);

      expect(result.sessions).toHaveLength(20);
      expect(result.currentPage).toBe(2);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPrevPage).toBe(true);
    });

    it('should return last page with remaining items', async () => {
      const result = await service.getPaginatedSessions(3, 20);

      expect(result.sessions).toHaveLength(10);
      expect(result.currentPage).toBe(3);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPrevPage).toBe(true);
    });

    it('should handle custom page size', async () => {
      const result = await service.getPaginatedSessions(1, 10);

      expect(result.sessions).toHaveLength(10);
      expect(result.totalPages).toBe(5);
    });

    it('should handle page beyond total pages', async () => {
      const result = await service.getPaginatedSessions(10, 20);

      expect(result.sessions).toHaveLength(0);
      expect(result.hasNextPage).toBe(false);
    });
  });

  describe('getSessionById', () => {
    it('should return null for invalid session ID', async () => {
      const result = await service.getSessionById('../../../etc/passwd');

      expect(result).toBeNull();
      expect(mockRepository.findAll).not.toHaveBeenCalled();
      expect(mockRepository.findById).not.toHaveBeenCalled();
    });

    it('should find session via repository lookup', async () => {
      mockRepository.findById.mockResolvedValue({
        id: 'session-2',
        summary: 'Second',
        toJSON: () => ({ id: 'session-2', summary: 'Second' })
      });

      const result = await service.getSessionById('session-2');

      expect(result).toEqual({ id: 'session-2', summary: 'Second' });
      expect(mockRepository.findById).toHaveBeenCalledWith('session-2');
      expect(mockRepository.findAll).not.toHaveBeenCalled();
    });

    it('should return null if session not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.getSessionById('nonexistent');

      expect(result).toBeUndefined();
      expect(mockRepository.findById).toHaveBeenCalledWith('nonexistent');
    });
  });

  describe('getSessionWithEvents', () => {
    it('should return null for non-existent session', async () => {
      mockRepository.findAll.mockResolvedValue([]);
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.getSessionWithEvents('nonexistent');

      expect(result).toBeNull();
    });

    it('should return session with events and metadata', async () => {
      const sessionId = 'test-session';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'session.start',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { selectedModel: 'claude-3-sonnet' }
      }) + '\n');

      const mockSession = {
        id: sessionId,
        type: 'directory',
        source: 'copilot',
        summary: 'Test session',
        createdAt: '2026-02-20T09:00:00.000Z',
        updatedAt: '2026-02-20T11:00:00.000Z'
      };

      mockRepository.findAll.mockResolvedValue([
        { ...mockSession, toJSON: () => mockSession }
      ]);
      mockRepository.findById.mockResolvedValue(mockSession);

      // Create a real service with the tmp directory
      service = new SessionService(tmpDir);
      service.SESSION_DIR = tmpDir;

      const result = await service.getSessionWithEvents(sessionId);

      expect(result).not.toBeNull();
      expect(result.session).toBeDefined();
      expect(result.events).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.model).toBe('claude-3-sonnet');
    });

    it('should derive updated time from last event', async () => {
      const sessionId = 'test-session';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const events = [
        { type: 'session.start', timestamp: '2026-02-20T10:00:00.000Z' },
        { type: 'user.message', timestamp: '2026-02-20T10:05:00.000Z' },
        { type: 'assistant.message', timestamp: '2026-02-20T10:10:00.000Z' }
      ];

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = {
        id: sessionId,
        type: 'directory',
        source: 'copilot',
        summary: 'Test',
        createdAt: '2026-02-20T09:00:00.000Z',
        updatedAt: '2026-02-20T09:30:00.000Z'
      };

      mockRepository.findAll.mockResolvedValue([
        { ...mockSession, toJSON: () => mockSession }
      ]);
      mockRepository.findById.mockResolvedValue(mockSession);

      service = new SessionService(tmpDir);
      service.SESSION_DIR = tmpDir;

      const result = await service.getSessionWithEvents(sessionId);

      expect(result.metadata.updated).toBe('2026-02-20T10:10:00.000Z');
      expect(result.metadata.created).toBe('2026-02-20T10:00:00.000Z');
    });
  });

  describe('_normalizeEvent', () => {
    it('should normalize copilot request/response events', () => {
      const requestEvent = {
        type: 'request',
        timestamp: '2026-02-20T10:00:00.000Z',
        payload: {
          messages: [
            { role: 'user', content: 'Hello' }
          ]
        }
      };

      const normalized = service._normalizeEvent(requestEvent, 'copilot');

      expect(normalized.type).toBe('user');
      expect(normalized.message.role).toBe('user');
      expect(normalized.message.content).toBe('Hello');
    });

    it('should normalize copilot response events', () => {
      const responseEvent = {
        type: 'response',
        timestamp: '2026-02-20T10:00:01.000Z',
        payload: {
          content: [
            { type: 'text', text: 'Hello back!' }
          ]
        }
      };

      const normalized = service._normalizeEvent(responseEvent, 'copilot');

      expect(normalized.type).toBe('assistant');
      expect(normalized.message.content).toBe('Hello back!');
    });

    it('should handle copilot assistant.message with content', () => {
      const event = {
        type: 'assistant.message',
        data: { content: 'Test message' }
      };

      const normalized = service._normalizeEvent(event, 'copilot');

      expect(normalized.data.message).toBe('Test message');
    });

    it('should handle copilot assistant.message with only tool calls', () => {
      const event = {
        type: 'assistant.message',
        data: {
          content: '',
          toolRequests: [{ name: 'Read', toolCallId: '123' }]
        }
      };

      const normalized = service._normalizeEvent(event, 'copilot');

      expect(normalized.data.message).toBeUndefined();
    });

    it('should normalize claude file-history-snapshot events', () => {
      const event = {
        type: 'file-history-snapshot',
        snapshot: {
          trackedFileBackups: {
            'file1.js': { version: 1 },
            'file2.js': { version: 2 }
          }
        }
      };

      const normalized = service._normalizeEvent(event, 'claude');

      expect(normalized.data.message).toContain('file1.js');
      expect(normalized.data.message).toContain('file2.js');
    });

    it('should handle empty file-history-snapshot', () => {
      const event = {
        type: 'file-history-snapshot',
        snapshot: {
          trackedFileBackups: {}
        }
      };

      const normalized = service._normalizeEvent(event, 'claude');

      expect(normalized.data.message).toBe('No files tracked');
    });

    it('should normalize claude progress events', () => {
      const event = {
        type: 'progress',
        data: {
          hookName: 'test-hook',
          hookEvent: 'start',
          command: 'npm test'
        }
      };

      const normalized = service._normalizeEvent(event, 'claude');

      expect(normalized.data.message).toContain('test-hook');
      expect(normalized.data.message).toContain('npm test');
    });

    it('should extract tools from claude progress events', () => {
      const event = {
        type: 'progress',
        data: {
          message: {
            message: {
              content: [
                { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} }
              ]
            }
          }
        }
      };

      const normalized = service._normalizeEvent(event, 'claude');

      expect(normalized.data.tools).toBeDefined();
      expect(normalized.data.tools[0].name).toBe('Read');
    });

    it('should handle claude user/assistant with mixed content', () => {
      const event = {
        type: 'user',
        message: {
          content: [
            { type: 'text', text: 'Valid text' },
            { type: 'text', text: 'More text' }
          ]
        }
      };

      const normalized = service._normalizeEvent(event, 'claude');

      expect(normalized.data.message).toContain('Valid text');
      expect(normalized.data.message).toContain('More text');
    });
  });

  describe('_extractClaudeTextContent', () => {
    it('should extract text from string content', () => {
      const content = 'Simple text';
      const result = service._extractClaudeTextContent(content);

      expect(result).toBe('Simple text');
    });

    it('should extract text from array with text blocks', () => {
      const content = [
        { type: 'text', text: 'First' },
        { type: 'text', text: 'Second' }
      ];
      const result = service._extractClaudeTextContent(content);

      expect(result).toBe('First\nSecond');
    });

    it('should extract text from tool_result with string content', () => {
      const content = [
        { type: 'tool_result', content: 'Tool output' }
      ];
      const result = service._extractClaudeTextContent(content);

      expect(result).toBe('Tool output');
    });

    it('should extract text from tool_result with nested array', () => {
      const content = [
        {
          type: 'tool_result',
          content: [
            { type: 'text', text: 'Nested text' }
          ]
        }
      ];
      const result = service._extractClaudeTextContent(content);

      expect(result).toBe('Nested text');
    });

    it('should handle empty content', () => {
      expect(service._extractClaudeTextContent([])).toBe('');
      expect(service._extractClaudeTextContent('')).toBe('');
      expect(service._extractClaudeTextContent(null)).toBe('');
      expect(service._extractClaudeTextContent(undefined)).toBe('');
    });
  });

  describe('_matchCopilotToolCalls', () => {
    it('should match tool execution start and complete', () => {
      const events = [
        {
          type: 'assistant.message',
          data: {
            toolRequests: [
              { toolCallId: 'tool-1', name: 'Read', arguments: { file: 'test.js' } }
            ]
          }
        },
        {
          type: 'tool.execution_start',
          data: { toolCallId: 'tool-1', toolName: 'Read' }
        },
        {
          type: 'tool.execution_complete',
          data: { toolCallId: 'tool-1', result: 'File content' }
        }
      ];

      service._matchCopilotToolCalls(events);

      expect(events[0].data.tools).toBeDefined();
      expect(events[0].data.tools[0].name).toBe('Read');
      expect(events[0].data.tools[0].result).toBe('File content');
      expect(events[0].data.tools[0]._matched).toBe(true);
    });

    it('should handle orphaned execution_complete events', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const events = [
        {
          type: 'tool.execution_complete',
          data: { toolCallId: 'orphan', toolName: 'Read', result: 'output' }
        }
      ];

      service._matchCopilotToolCalls(events);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Orphaned tool.execution_complete')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should mark unmatched tools as not matched', () => {
      const events = [
        {
          type: 'assistant.message',
          data: {
            toolRequests: [
              { toolCallId: 'tool-1', name: 'Read' }
            ]
          }
        }
      ];

      service._matchCopilotToolCalls(events);

      expect(events[0].data.tools[0]._matched).toBe(false);
    });
  });

  describe('_matchClaudeToolResults', () => {
    it('should match tool_use with tool_result', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const events = [
        {
          type: 'assistant',
          data: {
            tools: [
              { type: 'tool_use', id: 'tool-1', name: 'Read' }
            ]
          }
        },
        {
          type: 'user',
          data: {
            tools: [
              { type: 'tool_result', tool_use_id: 'tool-1', content: 'Result' }
            ]
          }
        }
      ];

      service._matchClaudeToolResults(events);

      expect(events[0].data.tools[0].result).toBe('Result');
      expect(events[0].data.tools[0]._matched).toBe(true);
      // tool_result should be kept in user messages
      expect(events[1].data.tools[0].type).toBe('tool_result');

      consoleWarnSpy.mockRestore();
    });

    it('should warn about tool_result without tool_use_id', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const events = [
        {
          type: 'assistant',
          data: {
            tools: [
              { type: 'tool_result', content: 'Result' }
            ]
          }
        }
      ];

      service._matchClaudeToolResults(events);

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it('should mark unmatched Claude tools', () => {
      const events = [
        {
          type: 'assistant',
          data: {
            tools: [
              { type: 'tool_use', id: 'tool-1', name: 'Read' }
            ]
          }
        }
      ];

      service._matchClaudeToolResults(events);

      expect(events[0].data.tools[0]._matched).toBe(false);
    });
  });
});
