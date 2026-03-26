const fs = require('fs');
const path = require('path');
const os = require('os');
const SessionService = require('../src/services/sessionService');
const SessionRepository = require('../src/services/sessionRepository');

// Mock dependencies
jest.mock('../src/services/sessionRepository');

describe('SessionService - Coverage Enhancement', () => {
  let service;
  let tmpDir;
  let mockRepository;
  let consoleErrorSpy;

  beforeEach(async () => {
    // Mock console.error to avoid test failures from expected error logs
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'session-coverage-'));

    // Mock SessionRepository
    mockRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      sources: [
        { type: 'copilot', dir: path.join(tmpDir, 'copilot') },
        { type: 'claude', dir: path.join(tmpDir, 'claude') },
        { type: 'pi-mono', dir: path.join(tmpDir, 'pi-mono') },
        { type: 'vscode', dir: path.join(tmpDir, 'vscode') }
      ]
    };
    SessionRepository.mockImplementation(() => mockRepository);

    service = new SessionService();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Restore console.error
    if (consoleErrorSpy) {
      consoleErrorSpy.mockRestore();
    }
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getSessionEvents - Copilot source paths (lines 77-98)', () => {
    it('should handle copilot session with single-source mode - directory format', async () => {
      const sessionId = 'copilot-session-dir';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const events = await serviceWithDir.getSessionEvents(sessionId);

      expect(events.length).toBeGreaterThan(0);
    });

    it('should handle copilot session with single-source mode - file format (catch block)', async () => {
      const sessionId = 'copilot-session-file';

      // Create events.jsonl as a file, not directory
      const eventsFile = path.join(tmpDir, `${sessionId}.jsonl`);
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      const mockSession = { id: sessionId, type: 'file', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const events = await serviceWithDir.getSessionEvents(sessionId);

      expect(events.length).toBeGreaterThan(0);
    });

    it('should handle copilot session with multi-source mode - directory format', async () => {
      const sessionId = 'multi-copilot-dir';
      const copilotDir = path.join(tmpDir, 'copilot');
      const sessionDir = path.join(copilotDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Multi-source test' }
      }));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const events = await service.getSessionEvents(sessionId);

      expect(events.length).toBeGreaterThan(0);
    });

    it('should handle copilot session with multi-source mode - file format (catch block)', async () => {
      const sessionId = 'multi-copilot-file';
      const copilotDir = path.join(tmpDir, 'copilot');
      await fs.promises.mkdir(copilotDir, { recursive: true });

      const eventsFile = path.join(copilotDir, `${sessionId}.jsonl`);
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      const mockSession = { id: sessionId, type: 'file', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const events = await service.getSessionEvents(sessionId);

      expect(events.length).toBeGreaterThan(0);
    });

    it('should return empty array if copilot source not found', async () => {
      const sessionId = 'no-source';
      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);
      mockRepository.sources = [];

      const events = await service.getSessionEvents(sessionId);

      expect(events).toEqual([]);
    });
  });

  describe('getSessionEvents - Claude source (lines 99-124)', () => {
    it('should handle claude session and search project directories', async () => {
      const sessionId = 'claude-session-123';
      const claudeDir = path.join(tmpDir, 'claude');
      const projectDir = path.join(claudeDir, 'project1');
      await fs.promises.mkdir(projectDir, { recursive: true });

      const eventsFile = path.join(projectDir, `${sessionId}.jsonl`);
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user',
        timestamp: '2026-02-20T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Test' }] }
      }));

      const mockSession = { id: sessionId, type: 'file', source: 'claude' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const events = await service.getSessionEvents(sessionId);

      expect(events.length).toBeGreaterThan(0);
    });

    it('should return empty array if claude source not found', async () => {
      const sessionId = 'claude-no-source';
      const mockSession = { id: sessionId, type: 'file', source: 'claude' };
      mockRepository.findById.mockResolvedValue(mockSession);
      mockRepository.sources = mockRepository.sources.filter(s => s.type !== 'claude');

      const events = await service.getSessionEvents(sessionId);

      expect(events).toEqual([]);
    });

    it('should skip main file search for directory type claude sessions', async () => {
      const sessionId = 'claude-dir-session';
      const mockSession = { id: sessionId, type: 'directory', source: 'claude' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const events = await service.getSessionEvents(sessionId);

      // Should return empty array since no subagents exist
      expect(events).toEqual([]);
    });

    it('should handle error when searching Claude projects', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const sessionId = 'claude-error';
      // Don't create directory to trigger error

      const mockSession = { id: sessionId, type: 'file', source: 'claude' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const events = await service.getSessionEvents(sessionId);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toBe('Error searching Claude projects:');
      expect(events).toEqual([]);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getSessionEvents - Pi-Mono source (lines 125-148)', () => {
    it('should handle pi-mono session and find matching file', async () => {
      const sessionId = 'uuid-123-456';
      const piMonoDir = path.join(tmpDir, 'pi-mono');
      const projectDir = path.join(piMonoDir, 'project1');
      await fs.promises.mkdir(projectDir, { recursive: true });

      const eventsFile = path.join(projectDir, `20260220_${sessionId}.jsonl`);
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'message',
        timestamp: '2026-02-20T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Test' }] }
      }));

      const mockSession = { id: sessionId, type: 'file', source: 'pi-mono' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const events = await service.getSessionEvents(sessionId);

      expect(events.length).toBeGreaterThan(0);
    });

    it('should return empty array if pi-mono source not found', async () => {
      const sessionId = 'pi-mono-no-source';
      const mockSession = { id: sessionId, type: 'file', source: 'pi-mono' };
      mockRepository.findById.mockResolvedValue(mockSession);
      mockRepository.sources = mockRepository.sources.filter(s => s.type !== 'pi-mono');

      const events = await service.getSessionEvents(sessionId);

      expect(events).toEqual([]);
    });

    it('should handle error when searching Pi-Mono sessions', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const sessionId = 'pi-mono-error';
      // Don't create directory to trigger error

      const mockSession = { id: sessionId, type: 'file', source: 'pi-mono' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const events = await service.getSessionEvents(sessionId);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toBe('Error searching Pi-Mono sessions:');
      expect(events).toEqual([]);

      consoleErrorSpy.mockRestore();
    });

    it('should handle pi-mono project directory that cannot be read', async () => {
      const sessionId = 'pi-mono-unreadable';
      const piMonoDir = path.join(tmpDir, 'pi-mono');
      await fs.promises.mkdir(piMonoDir, { recursive: true });

      // Create a file (not directory) to trigger catch block
      const projectFile = path.join(piMonoDir, 'not-a-dir');
      await fs.promises.writeFile(projectFile, 'test');

      const mockSession = { id: sessionId, type: 'file', source: 'pi-mono' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const events = await service.getSessionEvents(sessionId);

      expect(events).toEqual([]);
    });
  });

  describe('getSessionEvents - VS Code custom pipeline', () => {
    it('should load vscode events through the adapter pipeline', async () => {
      const sessionId = 'vscode-session';
      const sessionFile = path.join(tmpDir, `${sessionId}.json`);

      await fs.promises.writeFile(sessionFile, JSON.stringify({
        sessionId,
        creationDate: '2026-02-20T10:00:00.000Z',
        requests: [{
          requestId: 'req-1',
          timestamp: '2026-02-20T10:01:00.000Z',
          message: { text: 'Open README' },
          modelId: 'gpt-4',
          response: [
            { kind: 'markdownContent', content: { value: 'Done' } },
            {
              kind: 'toolInvocationSerialized',
              toolCallId: 'tool-1',
              toolId: 'copilot_readFile',
              isComplete: true,
              toolSpecificData: {
                input: { fsPath: '/repo/README.md' },
                result: 'README.md'
              }
            }
          ]
        }]
      }));

      const mockSession = { id: sessionId, type: 'file', source: 'vscode', filePath: sessionFile };
      mockRepository.findById.mockResolvedValue(mockSession);

      const events = await service.getSessionEvents(sessionId);

      expect(events.some(event => event.type === 'assistant.message' && event.data?.tools?.length > 0)).toBe(true);
      expect(events.some(event => event.type === 'tool.execution_start')).toBe(true);
      expect(events.some(event => event.type === 'tool.execution_complete')).toBe(true);
    });
  });

  describe('_mergeSubAgentEvents - Copilot (lines 312-439)', () => {
    it('should merge copilot subagents from events.jsonl directory structure', async () => {
      const sessionId = 'copilot-with-subagents';
      const sessionDir = path.join(tmpDir, sessionId);
      const subagentsDir = path.join(sessionDir, 'subagents');
      await fs.promises.mkdir(subagentsDir, { recursive: true });

      // Main events file
      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      // Subagent file
      const subagentFile = path.join(subagentsDir, 'agent-test-1.jsonl');
      const subagentEvents = [
        { type: 'assistant.message', timestamp: '2026-02-20T10:01:00.000Z', agentId: 'test-1', message: { content: 'Subagent response' }, data: {} }
      ];
      await fs.promises.writeFile(subagentFile, subagentEvents.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const events = await serviceWithDir.getSessionEvents(sessionId);

      // Should have main event + subagent.started + subagent events + subagent.completed
      expect(events.length).toBeGreaterThan(2);
      expect(events.some(e => e.type === 'subagent.started')).toBe(true);
      expect(events.some(e => e.type === 'subagent.completed')).toBe(true);
    });

    it('should handle subagent with long message content (truncation)', async () => {
      const sessionId = 'copilot-subagent-long';
      const sessionDir = path.join(tmpDir, sessionId);
      const subagentsDir = path.join(sessionDir, 'subagents');
      await fs.promises.mkdir(subagentsDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      const longMessage = 'a'.repeat(150);
      const subagentFile = path.join(subagentsDir, 'agent-test-2.jsonl');
      await fs.promises.writeFile(subagentFile, JSON.stringify({
        type: 'assistant.message',
        timestamp: '2026-02-20T10:01:00.000Z',
        agentId: 'test-2',
        message: { content: longMessage },
        data: {}
      }));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const events = await serviceWithDir.getSessionEvents(sessionId);

      const startedEvent = events.find(e => e.type === 'subagent.started');
      expect(startedEvent).toBeDefined();
      expect(startedEvent.data.agentDescription.length).toBeLessThanOrEqual(103); // 100 + '...'
    });

    it('should handle subagent with array content in message', async () => {
      const sessionId = 'copilot-subagent-array';
      const sessionDir = path.join(tmpDir, sessionId);
      const subagentsDir = path.join(sessionDir, 'subagents');
      await fs.promises.mkdir(subagentsDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      const subagentFile = path.join(subagentsDir, 'agent-test-3.jsonl');
      await fs.promises.writeFile(subagentFile, JSON.stringify({
        type: 'assistant.message',
        timestamp: '2026-02-20T10:01:00.000Z',
        agentId: 'test-3',
        message: { content: [{ type: 'text', text: 'Array content' }] },
        data: {}
      }));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const events = await serviceWithDir.getSessionEvents(sessionId);

      expect(events.length).toBeGreaterThan(0);
    });

    it('should handle subagent with malformed JSON line', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const sessionId = 'copilot-subagent-malformed';
      const sessionDir = path.join(tmpDir, sessionId);
      const subagentsDir = path.join(sessionDir, 'subagents');
      await fs.promises.mkdir(subagentsDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      const subagentFile = path.join(subagentsDir, 'agent-test-4.jsonl');
      await fs.promises.writeFile(subagentFile, 'INVALID JSON\n' + JSON.stringify({
        type: 'assistant.message',
        timestamp: '2026-02-20T10:01:00.000Z',
        data: {}
      }));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      await serviceWithDir.getSessionEvents(sessionId);

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should handle empty subagent file', async () => {
      const sessionId = 'copilot-subagent-empty';
      const sessionDir = path.join(tmpDir, sessionId);
      const subagentsDir = path.join(sessionDir, 'subagents');
      await fs.promises.mkdir(subagentsDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      const subagentFile = path.join(subagentsDir, 'agent-empty.jsonl');
      await fs.promises.writeFile(subagentFile, '');

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const events = await serviceWithDir.getSessionEvents(sessionId);

      // Should only have main event, no subagent events
      expect(events.length).toBe(1);
    });

    it('should skip subagents directory if not found', async () => {
      const sessionId = 'copilot-no-subagents';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const events = await serviceWithDir.getSessionEvents(sessionId);

      expect(events.length).toBe(1);
    });

    it('should handle error reading subagent file', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const sessionId = 'copilot-subagent-error';
      const sessionDir = path.join(tmpDir, sessionId);
      const subagentsDir = path.join(sessionDir, 'subagents');
      await fs.promises.mkdir(subagentsDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      // Create subagent directory (not file) to trigger error
      const subagentDir = path.join(subagentsDir, 'agent-error.jsonl');
      await fs.promises.mkdir(subagentDir, { recursive: true });

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      await serviceWithDir.getSessionEvents(sessionId);

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should merge claude subagents', async () => {
      const sessionId = 'claude-with-subagents';
      const claudeDir = path.join(tmpDir, 'claude');
      const projectDir = path.join(claudeDir, 'project1');
      const sessionDir = path.join(projectDir, sessionId);
      const subagentsDir = path.join(sessionDir, 'subagents');
      await fs.promises.mkdir(subagentsDir, { recursive: true });

      const eventsFile = path.join(projectDir, `${sessionId}.jsonl`);
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user',
        timestamp: '2026-02-20T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Test' }] }
      }));

      const subagentFile = path.join(subagentsDir, 'agent-claude-1.jsonl');
      await fs.promises.writeFile(subagentFile, JSON.stringify({
        type: 'assistant',
        timestamp: '2026-02-20T10:01:00.000Z',
        agentId: 'claude-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Response' }] }
      }));

      const mockSession = { id: sessionId, type: 'file', source: 'claude' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const events = await service.getSessionEvents(sessionId);

      expect(events.length).toBeGreaterThan(2);
      expect(events.some(e => e.type === 'subagent.started')).toBe(true);
    });

    it('should handle error searching claude subagents', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const sessionId = 'claude-subagent-error';
      // Don't create claude directory to trigger error

      const mockSession = { id: sessionId, type: 'file', source: 'claude' };
      mockRepository.findById.mockResolvedValue(mockSession);

      await service.getSessionEvents(sessionId);

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('_mergePiMonoToolResults (lines 504-553)', () => {
    it('should match pi-mono tool results by parentId chain', () => {
      const events = [
        {
          id: 'msg-1',
          type: 'assistant.message',  // After normalization
          timestamp: '2026-02-20T10:00:00.000Z',
          data: {
            role: 'assistant',
            message: 'Running tools',
            tools: [
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} },
              { type: 'tool_use', id: 'tool-2', name: 'Write', input: {} }
            ]
          }
        },
        {
          id: 'result-1',
          type: 'message',  // toolResult keeps 'message' type
          parentId: 'msg-1',
          timestamp: '2026-02-20T10:00:01.000Z',
          data: { role: 'toolResult', result: 'File content' }
        },
        {
          id: 'result-2',
          type: 'message',  // toolResult keeps 'message' type
          parentId: 'result-1',
          timestamp: '2026-02-20T10:00:02.000Z',
          data: { role: 'toolResult', result: 'Write success' }
        }
      ];

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      service._mergePiMonoToolResults(events);

      expect(events[0].data.tools[0].result).toBe('File content');
      expect(events[0].data.tools[0].status).toBe('completed');
      expect(events[0].data.tools[1].result).toBe('Write success');
      expect(events[0].data.tools[1].status).toBe('completed');

      // toolResult events should be removed
      expect(events.filter(e => e.data?.role === 'toolResult')).toHaveLength(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PI-MONO] Merged 2 toolResult events')
      );

      consoleLogSpy.mockRestore();
    });

    it('should handle pi-mono with partial tool matches', () => {
      const events = [
        {
          id: 'msg-1',
          type: 'assistant.message',  // After normalization
          data: {
            role: 'assistant',
            tools: [
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} },
              { type: 'tool_use', id: 'tool-2', name: 'Write', input: {} }
            ]
          }
        },
        {
          id: 'result-1',
          type: 'message',  // toolResult keeps 'message' type
          parentId: 'msg-1',
          data: { role: 'toolResult', result: 'Only one result' }
        }
      ];

      service._mergePiMonoToolResults(events);

      // After merge, first tool should have result
      expect(events[0].data.tools[0].result).toBe('Only one result');
      expect(events[0].data.tools[0].status).toBe('completed');
      // Second tool has no result
      expect(events[0].data.tools[1].result).toBeUndefined();
      expect(events[0].data.tools[1].status).toBeUndefined();
      // toolResult event should be removed
      expect(events.length).toBe(1);
    });
  });

  describe('Pi-Mono format normalization', () => {
    it('should normalize pi-mono user messages', () => {
      const event = {
        type: 'message',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'User message' }
          ]
        }
      };

      const normalized = service._normalizeEvent(event, 'pi-mono');

      // Pi-Mono transforms to unified type "user.message"
      expect(normalized.type).toBe('user.message');
      expect(normalized.data.role).toBe('user');
      expect(normalized.data.message).toBe('User message');
    });

    it('should normalize pi-mono assistant messages with tools', () => {
      const event = {
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Using tools' },
            { type: 'toolCall', id: 'tool-1', name: 'Read', arguments: { file: 'test.js' } }
          ]
        }
      };

      const normalized = service._normalizeEvent(event, 'pi-mono');

      // Pi-Mono transforms to unified type "assistant.message"
      expect(normalized.type).toBe('assistant.message');
      expect(normalized.data.role).toBe('assistant');
      expect(normalized.data.message).toBe('Using tools');
      expect(normalized.data.tools).toHaveLength(1);
      expect(normalized.data.tools[0].name).toBe('Read');
    });

    it('should normalize pi-mono toolResult messages', () => {
      const event = {
        type: 'message',
        message: {
          role: 'toolResult',
          content: [
            { type: 'text', text: 'Tool output' }
          ]
        }
      };

      const normalized = service._normalizeEvent(event, 'pi-mono');

      // Pi-Mono toolResult keeps type "message" - will be merged into assistant
      expect(normalized.type).toBe('message');
      expect(normalized.data.role).toBe('toolResult');
      expect(normalized.data.result).toBe('Tool output');
    });

    it('should normalize pi-mono model_change events', () => {
      const event = {
        type: 'model_change',
        provider: 'anthropic',
        modelId: 'claude-3-opus'
      };

      const normalized = service._normalizeEvent(event, 'pi-mono');

      expect(normalized.type).toBe('model.change');
      expect(normalized.data.provider).toBe('anthropic');
      expect(normalized.data.model).toBe('claude-3-opus');
    });

    it('should normalize pi-mono thinking_level_change events', () => {
      const event = {
        type: 'thinking_level_change',
        thinkingLevel: 'extended'
      };

      const normalized = service._normalizeEvent(event, 'pi-mono');

      expect(normalized.type).toBe('thinking.change');
      expect(normalized.data.level).toBe('extended');
    });

    it('should normalize pi-mono session events', () => {
      const event = {
        type: 'session',
        cwd: '/home/user/project',
        version: '1.0.0'
      };

      const normalized = service._normalizeEvent(event, 'pi-mono');

      expect(normalized.data.cwd).toBe('/home/user/project');
      expect(normalized.data.version).toBe('1.0.0');
    });

    it('should preserve usage metadata in pi-mono messages', () => {
      const event = {
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Test' }],
          usage: {
            inputTokens: 100,
            outputTokens: 50
          }
        }
      };

      const normalized = service._normalizeEvent(event, 'pi-mono');

      expect(normalized.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50
      });
    });
  });

  describe('Timeline builders (lines 968-1254)', () => {
    it('should build pi-mono timeline', async () => {
      const sessionId = 'pi-mono-timeline';
      const piMonoDir = path.join(tmpDir, 'pi-mono');
      const projectDir = path.join(piMonoDir, 'project1');
      await fs.promises.mkdir(projectDir, { recursive: true });

      const events = [
        { type: 'message', timestamp: '2026-02-20T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] } },
        { type: 'message', timestamp: '2026-02-20T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] } }
      ];

      const eventsFile = path.join(projectDir, `20260220_${sessionId}.jsonl`);
      await fs.promises.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = { id: sessionId, type: 'file', source: 'pi-mono' };
      mockRepository.findAll.mockResolvedValue([{ ...mockSession, toJSON: () => mockSession }]);
      mockRepository.findById.mockResolvedValue(mockSession);

      const timeline = await service.getTimeline(sessionId);

      expect(timeline).toBeDefined();
      expect(timeline.turns).toBeDefined();
      expect(timeline.summary).toBeDefined();
      expect(timeline.summary.totalTurns).toBeGreaterThan(0);
    });

    it('should build copilot timeline', async () => {
      const sessionId = 'copilot-timeline';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const events = [
        { type: 'assistant.turn_start', timestamp: '2026-02-20T10:00:00.000Z', data: { message: 'Starting' } },
        { type: 'assistant.turn_complete', timestamp: '2026-02-20T10:00:10.000Z', data: {} }
      ];

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findAll.mockResolvedValue([{ ...mockSession, toJSON: () => mockSession }]);
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const timeline = await serviceWithDir.getTimeline(sessionId);

      expect(timeline).toBeDefined();
      expect(timeline.turns).toBeDefined();
      expect(timeline.summary.totalTurns).toBeGreaterThan(0);
    });

    it('should build claude timeline', async () => {
      const sessionId = 'claude-timeline';
      const claudeDir = path.join(tmpDir, 'claude');
      const projectDir = path.join(claudeDir, 'project1');
      await fs.promises.mkdir(projectDir, { recursive: true });

      const events = [
        { type: 'user', timestamp: '2026-02-20T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Test' }] } },
        { type: 'assistant', timestamp: '2026-02-20T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Response' }] } }
      ];

      const eventsFile = path.join(projectDir, `${sessionId}.jsonl`);
      await fs.promises.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = { id: sessionId, type: 'file', source: 'claude' };
      mockRepository.findAll.mockResolvedValue([{ ...mockSession, toJSON: () => mockSession }]);
      mockRepository.findById.mockResolvedValue(mockSession);

      const timeline = await service.getTimeline(sessionId);

      expect(timeline).toBeDefined();
      expect(timeline.turns).toBeDefined();
    });

    it('should return null for non-existent session in getTimeline', async () => {
      mockRepository.findAll.mockResolvedValue([]);
      mockRepository.findById.mockResolvedValue(null);

      const timeline = await service.getTimeline('non-existent');

      expect(timeline).toBeNull();
    });

    it('should handle copilot timeline with tools', async () => {
      const sessionId = 'copilot-timeline-tools';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const events = [
        { type: 'assistant.turn_start', timestamp: '2026-02-20T10:00:00.000Z', data: { message: 'Starting' } },
        { type: 'tool.execution_start', timestamp: '2026-02-20T10:00:01.000Z', data: { tool: 'Read', arguments: {} } },
        { type: 'tool.execution_complete', timestamp: '2026-02-20T10:00:02.000Z', data: { tool: 'Read', result: 'Data' } },
        { type: 'assistant.turn_complete', timestamp: '2026-02-20T10:00:10.000Z', data: {} }
      ];

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findAll.mockResolvedValue([{ ...mockSession, toJSON: () => mockSession }]);
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const timeline = await serviceWithDir.getTimeline(sessionId);

      expect(timeline.summary.totalTools).toBeGreaterThan(0);
    });

    it('should close open turn in copilot timeline', async () => {
      const sessionId = 'copilot-timeline-open';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const events = [
        { type: 'assistant.turn_start', timestamp: '2026-02-20T10:00:00.000Z', data: { message: 'Starting' } }
        // No turn_complete
      ];

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findAll.mockResolvedValue([{ ...mockSession, toJSON: () => mockSession }]);
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const timeline = await serviceWithDir.getTimeline(sessionId);

      expect(timeline.turns).toHaveLength(1);
      expect(timeline.turns[0].endTime).toBe('2026-02-20T10:00:00.000Z');
    });

    it('should build vscode timeline via adapter', async () => {
      const sessionId = 'vscode-timeline';
      const sessionFile = path.join(tmpDir, `${sessionId}.json`);

      await fs.promises.writeFile(sessionFile, JSON.stringify({
        sessionId,
        creationDate: '2026-02-20T10:00:00.000Z',
        requests: [{
          requestId: 'req-1',
          timestamp: '2026-02-20T10:01:00.000Z',
          message: { text: 'Use a tool' },
          modelId: 'gpt-4',
          response: [
            { kind: 'markdownContent', content: { value: 'Working on it' } },
            {
              kind: 'toolInvocationSerialized',
              toolCallId: 'tool-1',
              toolId: 'copilot_readFile',
              isComplete: true,
              toolSpecificData: {
                input: { fsPath: '/repo/index.js' },
                result: 'index.js'
              }
            }
          ]
        }]
      }));

      const mockSession = { id: sessionId, type: 'file', source: 'vscode', filePath: sessionFile };
      mockRepository.findAll.mockResolvedValue([{ ...mockSession, toJSON: () => mockSession }]);
      mockRepository.findById.mockResolvedValue(mockSession);

      const timeline = await service.getTimeline(sessionId);

      expect(timeline.turns).toHaveLength(1);
      expect(timeline.turns[0].assistantTurns.length).toBeGreaterThan(0);
      expect(timeline.summary.totalTools).toBe(1);
    });
  });

  describe('Format expansion methods (lines 1154-1482)', () => {
    it('should expand pi-mono to copilot format', () => {
      const events = [
        {
          type: 'user.message',
          timestamp: '2026-02-20T10:00:00.000Z',
          data: { message: 'Hello' },
          _fileIndex: 0
        },
        {
          type: 'assistant.message',
          timestamp: '2026-02-20T10:00:01.000Z',
          data: {
            message: 'Hi',
            tools: [
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} }
            ]
          },
          _fileIndex: 1
        }
      ];

      const expanded = service._expandPiMonoToCopilotFormat(events);

      expect(expanded.length).toBeGreaterThan(2);
      expect(expanded.some(e => e.type === 'assistant.turn_start')).toBe(true);
      expect(expanded.some(e => e.type === 'assistant.turn_complete')).toBe(true);
      expect(expanded.some(e => e.type === 'tool.execution_start')).toBe(true);
      expect(expanded.some(e => e.type === 'tool.execution_complete')).toBe(true);
    });

    it('should expand copilot to timeline format', () => {
      const events = [
        {
          type: 'user',
          timestamp: '2026-02-20T10:00:00.000Z',
          message: { content: 'Hello' },
          data: {},
          _fileIndex: 0
        },
        {
          type: 'assistant',
          uuid: 'asst-1',
          timestamp: '2026-02-20T10:00:01.000Z',
          message: { content: 'Hi' },
          data: {},
          _fileIndex: 1
        }
      ];

      const expanded = service._expandCopilotToTimelineFormat(events);

      expect(expanded.some(e => e.type === 'user.message')).toBe(true);
      expect(expanded.some(e => e.type === 'assistant.turn_start')).toBe(true);
      expect(expanded.some(e => e.type === 'assistant.message')).toBe(true); // Timeline rendering dependency
      expect(expanded.some(e => e.type === 'assistant.turn_complete')).toBe(true);
    });

    it('should expand copilot with array content', () => {
      const events = [
        {
          type: 'assistant',
          uuid: 'asst-1',
          timestamp: '2026-02-20T10:00:01.000Z',
          message: {
            content: [
              { type: 'text', text: 'Part 1' },
              { type: 'text', text: 'Part 2' }
            ]
          },
          data: {},
          _fileIndex: 0
        }
      ];

      const expanded = service._expandCopilotToTimelineFormat(events);

      const turnStart = expanded.find(e => e.type === 'assistant.turn_start');
      expect(turnStart.data.message).toContain('Part 1');
      expect(turnStart.data.message).toContain('Part 2');
    });

    it('should expand claude to timeline format', () => {
      const events = [
        {
          type: 'user',
          id: 'user-1',
          timestamp: '2026-02-20T10:00:00.000Z',
          data: { message: 'Hello' },
          _fileIndex: 0
        },
        {
          type: 'assistant',
          id: 'asst-1',
          timestamp: '2026-02-20T10:00:01.000Z',
          data: {
            message: 'Hi',
            tools: [
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: {}, result: 'Data' }
            ]
          },
          _fileIndex: 1
        }
      ];

      const expanded = service._expandClaudeToTimelineFormat(events);

      expect(expanded.some(e => e.type === 'user.message')).toBe(true);
      expect(expanded.some(e => e.type === 'assistant.turn_start')).toBe(true);
      expect(expanded.some(e => e.type === 'assistant.message')).toBe(true); // Timeline rendering dependency
      expect(expanded.some(e => e.type === 'tool.execution_start')).toBe(true);
      expect(expanded.some(e => e.type === 'tool.execution_complete')).toBe(true);
    });

    it('should preserve non-message events in pi-mono expansion', () => {
      const events = [
        { type: 'session.start', timestamp: '2026-02-20T10:00:00.000Z', data: {} },
        { type: 'user.message', timestamp: '2026-02-20T10:00:01.000Z', data: { message: 'Test' }, _fileIndex: 1 }
      ];

      const expanded = service._expandPiMonoToCopilotFormat(events);

      expect(expanded.some(e => e.type === 'session.start')).toBe(true);
    });

    it('should preserve non-user/assistant events in copilot expansion', () => {
      const events = [
        { type: 'session.start', timestamp: '2026-02-20T10:00:00.000Z', data: {} },
        { type: 'user', timestamp: '2026-02-20T10:00:01.000Z', message: { content: 'Test' }, data: {}, _fileIndex: 1 }
      ];

      const expanded = service._expandCopilotToTimelineFormat(events);

      expect(expanded.some(e => e.type === 'session.start')).toBe(true);
    });

    it('should preserve non-user/assistant events in claude expansion', () => {
      const events = [
        { type: 'session.start', timestamp: '2026-02-20T10:00:00.000Z', data: {} },
        { type: 'user', id: 'user-1', timestamp: '2026-02-20T10:00:01.000Z', data: { message: 'Test' }, _fileIndex: 1 }
      ];

      const expanded = service._expandClaudeToTimelineFormat(events);

      expect(expanded.some(e => e.type === 'session.start')).toBe(true);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle invalid session ID format', async () => {
      const result = await service.getSessionEvents('../../../etc/passwd');
      expect(result).toEqual([]);
    });

    it('should handle session with no events file', async () => {
      const sessionId = 'no-events';
      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const events = await service.getSessionEvents(sessionId);
      expect(events).toEqual([]);
    });

    it('should handle error reading main events file', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const sessionId = 'error-reading';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      // Create events.jsonl as a directory to trigger error
      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.mkdir(eventsFile);

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      await serviceWithDir.getSessionEvents(sessionId);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toBe('Error reading main events file:');

      consoleErrorSpy.mockRestore();
    });

    it('should filter events without timestamps', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const sessionId = 'no-timestamp';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const events = [
        { type: 'event.with.timestamp', timestamp: '2026-02-20T10:00:00.000Z' },
        { type: 'event.without.timestamp' }
      ];

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const result = await serviceWithDir.getSessionEvents(sessionId);

      expect(result.length).toBe(1);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle empty data in normalize event', () => {
      const event = { type: 'unknown' };
      const normalized = service._normalizeEvent(event, 'copilot');

      expect(normalized.data).toBeDefined();
    });

    it('should handle unknown event type in normalize', () => {
      const event = {
        type: 'unknown.type',
        data: { message: 'Test message' }
      };

      const normalized = service._normalizeEvent(event, 'claude');

      expect(normalized.data.message).toBe('Test message');
    });

    it('should extract model from session.model_change event', async () => {
      const sessionId = 'model-change';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const events = [
        { type: 'session.start', timestamp: '2026-02-20T10:00:00.000Z', data: {} },
        { type: 'session.model_change', timestamp: '2026-02-20T10:00:01.000Z', data: { newModel: 'claude-3-opus' } }
      ];

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = {
        id: sessionId,
        type: 'directory',
        source: 'copilot',
        summary: 'Test',
        createdAt: '2026-02-20T09:00:00.000Z'
      };

      mockRepository.findAll.mockResolvedValue([{ ...mockSession, toJSON: () => mockSession }]);
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const result = await serviceWithDir.getSessionWithEvents(sessionId);

      expect(result.metadata.model).toBe('claude-3-opus');
    });

    it('should handle tool error status in copilot timeline', async () => {
      const sessionId = 'tool-error';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const events = [
        { type: 'assistant.turn_start', timestamp: '2026-02-20T10:00:00.000Z', data: {} },
        { type: 'tool.execution_start', timestamp: '2026-02-20T10:00:01.000Z', data: { tool: 'Read' } },
        { type: 'tool.execution_complete', timestamp: '2026-02-20T10:00:02.000Z', data: { tool: 'Read', isError: true, error: 'File not found' } },
        { type: 'assistant.turn_complete', timestamp: '2026-02-20T10:00:03.000Z', data: {} }
      ];

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findAll.mockResolvedValue([{ ...mockSession, toJSON: () => mockSession }]);
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const timeline = await serviceWithDir.getTimeline(sessionId);

      expect(timeline.turns[0].tools[0].status).toBe('error');
    });

    it('should handle copilot response with multiple text blocks', () => {
      const event = {
        type: 'response',
        timestamp: '2026-02-20T10:00:01.000Z',
        payload: {
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' },
            { type: 'text', text: 'Part 3' }
          ]
        }
      };

      const normalized = service._normalizeEvent(event, 'copilot');

      expect(normalized.type).toBe('assistant');
      expect(normalized.message.content).toBe('Part 1\nPart 2\nPart 3');
    });

    it('should handle getPaginatedSessions with default parameters', async () => {
      const mockSessions = Array.from({ length: 25 }, (_, i) => ({
        id: `session-${i}`,
        toJSON: () => ({ id: `session-${i}` })
      }));
      mockRepository.findAll.mockResolvedValue(mockSessions);

      const result = await service.getPaginatedSessions();

      expect(result.currentPage).toBe(1);
      expect(result.sessions.length).toBeLessThanOrEqual(20);
    });

    it('should handle tool execution with error field', () => {
      const events = [
        {
          type: 'assistant.message',
          data: {
            toolRequests: [
              { toolCallId: 'tool-1', name: 'Read', arguments: {} }
            ]
          }
        },
        {
          type: 'tool.execution_start',
          data: { toolCallId: 'tool-1', toolName: 'Read' }
        },
        {
          type: 'tool.execution_complete',
          data: { toolCallId: 'tool-1', error: 'File not found', result: null }
        }
      ];

      service._matchCopilotToolCalls(events);

      expect(events[0].data.tools[0].status).toBe('error');
      expect(events[0].data.tools[0].error).toBe('File not found');
    });

    it('should handle copilot assistant.message without tools', () => {
      const events = [
        {
          type: 'assistant.message',
          data: { content: 'Just text, no tools' }
        }
      ];

      service._matchCopilotToolCalls(events);

      expect(events[0].data.tools).toBeUndefined();
    });

    it('should handle tool.execution_start without matching assistant message', () => {
      const events = [
        {
          type: 'tool.execution_start',
          data: { toolCallId: 'orphan', toolName: 'Read' }
        }
      ];

      service._matchCopilotToolCalls(events);

      // Should not throw error, just build the map
      expect(events).toHaveLength(1);
    });

    it('should handle copilot expansion with tools having start/complete events', () => {
      const events = [
        {
          type: 'assistant',
          uuid: 'asst-1',
          timestamp: '2026-02-20T10:00:00.000Z',
          message: { content: 'Test' },
          data: {
            tools: [
              {
                toolId: 'tool-1',
                start: { type: 'tool.execution_start', timestamp: '2026-02-20T10:00:01.000Z', data: {} },
                complete: { type: 'tool.execution_complete', timestamp: '2026-02-20T10:00:02.000Z', data: {} }
              }
            ]
          },
          _fileIndex: 0
        }
      ];

      const expanded = service._expandCopilotToTimelineFormat(events);

      expect(expanded.some(e => e.type === 'tool.execution_start')).toBe(true);
      expect(expanded.some(e => e.type === 'tool.execution_complete')).toBe(true);
    });

    it('should handle subagents directory that is not actually a directory', async () => {
      const sessionId = 'copilot-subagents-not-dir';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      // Create subagents as a file, not directory
      const subagentsFile = path.join(sessionDir, 'subagents');
      await fs.promises.writeFile(subagentsFile, 'not a directory');

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const events = await serviceWithDir.getSessionEvents(sessionId);

      // Should only have main event
      expect(events.length).toBe(1);
    });

    it('should handle empty copilot response payload', () => {
      const event = {
        type: 'response',
        timestamp: '2026-02-20T10:00:01.000Z',
        payload: {}
      };

      const normalized = service._normalizeEvent(event, 'copilot');

      expect(normalized.type).toBe('assistant');
    });

    it('should handle copilot request without messages', () => {
      const event = {
        type: 'request',
        timestamp: '2026-02-20T10:00:00.000Z',
        payload: {}
      };

      const normalized = service._normalizeEvent(event, 'copilot');

      expect(normalized.type).toBe('user');
    });

    it('should handle claude events with string content in message', () => {
      const event = {
        type: 'user',
        message: {
          content: 'Simple string content'
        }
      };

      const normalized = service._normalizeEvent(event, 'claude');

      expect(normalized.data.message).toBe('Simple string content');
    });

    it('should handle progress event with partial data', () => {
      const event = {
        type: 'progress',
        data: {
          hookName: 'test-hook'
          // Missing hookEvent and command
        }
      };

      const normalized = service._normalizeEvent(event, 'claude');

      expect(normalized.data.message).toContain('test-hook');
    });

    it('should handle progress event with nested tool_result', () => {
      const event = {
        type: 'progress',
        data: {
          message: {
            message: {
              content: [
                { type: 'tool_result', tool_use_id: 'tool-1', content: 'Result' }
              ]
            }
          }
        }
      };

      const normalized = service._normalizeEvent(event, 'claude');

      expect(normalized.data.tools).toBeDefined();
      expect(normalized.data.tools[0].type).toBe('tool_result');
    });

    it('should handle subagent with no agentId', async () => {
      const sessionId = 'copilot-subagent-no-id';
      const sessionDir = path.join(tmpDir, sessionId);
      const subagentsDir = path.join(sessionDir, 'subagents');
      await fs.promises.mkdir(subagentsDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      const subagentFile = path.join(subagentsDir, 'agent-no-id.jsonl');
      await fs.promises.writeFile(subagentFile, JSON.stringify({
        type: 'assistant.message',
        timestamp: '2026-02-20T10:01:00.000Z',
        message: { content: 'Response without agentId' },
        data: {}
      }));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const events = await serviceWithDir.getSessionEvents(sessionId);

      expect(events.length).toBeGreaterThan(0);
    });

    it('should handle subagent with malformed first event', async () => {
      const sessionId = 'copilot-subagent-bad-first';
      const sessionDir = path.join(tmpDir, sessionId);
      const subagentsDir = path.join(sessionDir, 'subagents');
      await fs.promises.mkdir(subagentsDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      const subagentFile = path.join(subagentsDir, 'agent-bad.jsonl');
      await fs.promises.writeFile(subagentFile, 'INVALID\n' + JSON.stringify({
        type: 'assistant.message',
        timestamp: '2026-02-20T10:01:00.000Z',
        data: {}
      }));

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const events = await serviceWithDir.getSessionEvents(sessionId);

      expect(events.length).toBeGreaterThan(0);
    });

    it('should handle subagent events with all parsing errors', async () => {
      const sessionId = 'copilot-subagent-all-bad';
      const sessionDir = path.join(tmpDir, sessionId);
      const subagentsDir = path.join(sessionDir, 'subagents');
      await fs.promises.mkdir(subagentsDir, { recursive: true });

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, JSON.stringify({
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Test' }
      }));

      const subagentFile = path.join(subagentsDir, 'agent-all-bad.jsonl');
      await fs.promises.writeFile(subagentFile, 'INVALID JSON LINE 1\nINVALID JSON LINE 2');

      const mockSession = { id: sessionId, type: 'directory', source: 'copilot' };
      mockRepository.findById.mockResolvedValue(mockSession);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const serviceWithDir = new SessionService(tmpDir);
      const events = await serviceWithDir.getSessionEvents(sessionId);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(events.length).toBe(1); // Only main event

      consoleErrorSpy.mockRestore();
    });

    it('should handle getSessionWithEvents with model from data.model', async () => {
      const sessionId = 'model-data';
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const events = [
        { type: 'session.start', timestamp: '2026-02-20T10:00:00.000Z', data: {} },
        { type: 'session.model_change', timestamp: '2026-02-20T10:00:01.000Z', data: { model: 'claude-3-sonnet' } }
      ];

      const eventsFile = path.join(sessionDir, 'events.jsonl');
      await fs.promises.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = {
        id: sessionId,
        type: 'directory',
        source: 'copilot',
        summary: 'Test',
        createdAt: '2026-02-20T09:00:00.000Z'
      };

      mockRepository.findAll.mockResolvedValue([{ ...mockSession, toJSON: () => mockSession }]);
      mockRepository.findById.mockResolvedValue(mockSession);

      const serviceWithDir = new SessionService(tmpDir);
      const result = await serviceWithDir.getSessionWithEvents(sessionId);

      expect(result.metadata.model).toBe('claude-3-sonnet');
    });

    it('should handle pi-mono timeline with multiple assistant turns', async () => {
      const sessionId = 'pi-mono-multi';
      const piMonoDir = path.join(tmpDir, 'pi-mono');
      const projectDir = path.join(piMonoDir, 'project1');
      await fs.promises.mkdir(projectDir, { recursive: true });

      const events = [
        { type: 'message', timestamp: '2026-02-20T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Q1' }] } },
        { type: 'message', timestamp: '2026-02-20T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'A1' }] } },
        { type: 'message', timestamp: '2026-02-20T10:00:02.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'A2' }] } }
      ];

      const eventsFile = path.join(projectDir, `20260220_${sessionId}.jsonl`);
      await fs.promises.writeFile(eventsFile, events.map(e => JSON.stringify(e)).join('\n'));

      const mockSession = { id: sessionId, type: 'file', source: 'pi-mono' };
      mockRepository.findAll.mockResolvedValue([{ ...mockSession, toJSON: () => mockSession }]);
      mockRepository.findById.mockResolvedValue(mockSession);

      const timeline = await service.getTimeline(sessionId);

      expect(timeline.turns.length).toBeGreaterThan(0);
      expect(timeline.summary).toBeDefined();
      expect(timeline.summary.totalTurns).toBeGreaterThan(0);
    });
  });
});
