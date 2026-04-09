const fs = require('fs');
const path = require('path');
const os = require('os');
const SessionService = require('../src/services/sessionService');

describe('SessionService', () => {
  let tmpDir;
  let service;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'session-test-'));
    service = new SessionService(tmpDir);
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getSessionEvents - sorting', () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    async function writeEventsFile(events) {
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });
      
      // Create events.jsonl
      const content = events.map(e => JSON.stringify(e)).join('\n');
      await fs.promises.writeFile(path.join(sessionDir, 'events.jsonl'), content);
      
      // Create workspace.yaml (required by SessionRepository)
      await fs.promises.writeFile(
        path.join(sessionDir, 'workspace.yaml'),
        'repo: test-repo\nsummary: Test Session\n'
      );
    }

    it('should sort events by timestamp in ascending order', async () => {
      await writeEventsFile([
        { type: 'user.message', timestamp: '2026-02-16T17:05:00.000Z' },
        { type: 'session.start', timestamp: '2026-02-16T17:03:00.000Z' },
        { type: 'assistant.message', timestamp: '2026-02-16T17:04:00.000Z' },
      ]);

      const events = await service.getSessionEvents(sessionId);

      expect(events[0].type).toBe('session.start');
      expect(events[1].type).toBe('assistant.message');
      expect(events[2].type).toBe('user.message');
    });

    it('should preserve file order for events with identical timestamps', async () => {
      const ts = '2026-02-16T17:49:29.531Z';
      await writeEventsFile([
        { type: 'assistant.message', timestamp: ts, data: { text: 'msg' } },
        { type: 'tool.execution_start', timestamp: ts, data: { tool: 'Read', toolCallId: '1' } },
        { type: 'tool.execution_start', timestamp: ts, data: { tool: 'Grep', toolCallId: '2' } },
        { type: 'tool.execution_start', timestamp: ts, data: { tool: 'Write', toolCallId: '3' } },
      ]);

      const events = await service.getSessionEvents(sessionId);

      expect(events[0].type).toBe('assistant.message');
      expect(events[1].data.tool).toBe('Read');
      expect(events[2].data.tool).toBe('Grep');
      expect(events[3].data.tool).toBe('Write');
    });

    it('should handle events with null/missing timestamps', async () => {
      await writeEventsFile([
        { type: 'event.a', timestamp: '2026-02-16T17:05:00.000Z' },
        { type: 'event.no_ts' },
        { type: 'event.null_ts', timestamp: null },
        { type: 'event.b', timestamp: '2026-02-16T17:03:00.000Z' },
      ]);

      const events = await service.getSessionEvents(sessionId);

      // Events without timestamps are now filtered out
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('event.b');
      expect(events[1].type).toBe('event.a');
    });

    it('should add _fileIndex to each event', async () => {
      await writeEventsFile([
        { type: 'event.first', timestamp: '2026-02-16T17:03:00.000Z' },
        { type: 'event.second', timestamp: '2026-02-16T17:04:00.000Z' },
        { type: 'event.third', timestamp: '2026-02-16T17:05:00.000Z' },
      ]);

      const events = await service.getSessionEvents(sessionId);

      expect(events[0]._fileIndex).toBe(0);
      expect(events[1]._fileIndex).toBe(1);
      expect(events[2]._fileIndex).toBe(2);
    });

    it('should skip malformed JSON lines and still sort correctly', async () => {
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });
      const content = [
        '{"type":"event.a","timestamp":"2026-02-16T17:05:00.000Z"}',
        'NOT VALID JSON',
        '{"type":"event.b","timestamp":"2026-02-16T17:03:00.000Z"}',
      ].join('\n');
      await fs.promises.writeFile(path.join(sessionDir, 'events.jsonl'), content);
      
      // Create workspace.yaml (required by SessionRepository)
      await fs.promises.writeFile(
        path.join(sessionDir, 'workspace.yaml'),
        'repo: test-repo\nsummary: Test Session\n'
      );

      const events = await service.getSessionEvents(sessionId);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('event.b');
      expect(events[1].type).toBe('event.a');
    });

    it('should return empty array for non-existent session', async () => {
      const events = await service.getSessionEvents('11111111-2222-3333-4444-555555555555');
      expect(events).toEqual([]);
    });

    it('should handle a large batch of duplicate-timestamp events stably', async () => {
      const ts = '2026-02-16T18:05:12.160Z';
      const eventData = [];
      for (let i = 0; i < 25; i++) {
        eventData.push({
          type: 'tool.execution_start',
          timestamp: ts,
          data: { tool: `tool_${i}`, toolCallId: `id_${i}` },
        });
      }
      await writeEventsFile(eventData);

      const events = await service.getSessionEvents(sessionId);

      expect(events).toHaveLength(25);
      // Verify file order is preserved exactly
      for (let i = 0; i < 25; i++) {
        expect(events[i].data.tool).toBe(`tool_${i}`);
        expect(events[i]._fileIndex).toBe(i);
      }
    });
  });

  describe('getSessionEvents - streaming and Claude format', () => {
    const sessionId = 'test-claude-session';

    it('should handle Claude format events', async () => {
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });
      
      const claudeEvents = [
        { type: 'user', uuid: 'user-1', timestamp: '2026-02-20T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] } },
        { type: 'assistant', uuid: 'asst-1', parentUuid: 'user-1', timestamp: '2026-02-20T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] } }
      ];
      
      const content = claudeEvents.map(e => JSON.stringify(e)).join('\n');
      await fs.promises.writeFile(path.join(sessionDir, 'events.jsonl'), content);
      await fs.promises.writeFile(path.join(sessionDir, 'workspace.yaml'), 'repo: test\n');
      
      const events = await service.getSessionEvents(sessionId);
      
      // Parser now generates synthetic turn_start/turn_complete events
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].type).toBe('user.message');
      // Synthetic events may be added for assistant turns
    });

    it('should handle large files with streaming', async () => {
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });
      
      // Generate 1000 events with unique timestamps
      const largeEvents = [];
      for (let i = 0; i < 1000; i++) {
        const minute = Math.floor(i / 60);
        const second = i % 60;
        largeEvents.push({
          type: 'tool.execution_start',
          timestamp: `2026-02-20T10:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.000Z`,
          data: { tool: `tool_${i}`, toolCallId: `id_${i}` }
        });
      }
      
      const content = largeEvents.map(e => JSON.stringify(e)).join('\n');
      await fs.promises.writeFile(path.join(sessionDir, 'events.jsonl'), content);
      await fs.promises.writeFile(path.join(sessionDir, 'workspace.yaml'), 'repo: test\n');
      
      const events = await service.getSessionEvents(sessionId);
      
      expect(events).toHaveLength(1000);
      expect(events[0].data.tool).toBe('tool_0');
      expect(events[999].data.tool).toBe('tool_999');
    });

    it('should filter out file-history-snapshot events from Claude sessions', async () => {
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const claudeEvents = [
        { type: 'user', uuid: 'user-1', timestamp: '2026-02-20T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] } },
        { type: 'file-history-snapshot', timestamp: '2026-02-20T10:00:00.500Z', snapshot: { trackedFileBackups: { 'file1.js': { version: 1 } } } },
        { type: 'assistant', uuid: 'asst-1', parentUuid: 'user-1', timestamp: '2026-02-20T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] } }
      ];

      const content = claudeEvents.map(e => JSON.stringify(e)).join('\n');
      await fs.promises.writeFile(path.join(sessionDir, 'events.jsonl'), content);
      await fs.promises.writeFile(path.join(sessionDir, 'workspace.yaml'), 'repo: test\n');

      const events = await service.getSessionEvents(sessionId);

      // file-history-snapshot events should be excluded from the result
      const snapshotEvents = events.filter(e => e.type === 'file-history-snapshot');
      expect(snapshotEvents).toHaveLength(0);
      // Other events should still be present
      expect(events.some(e => e.type === 'user.message')).toBe(true);
    });

    it('should preserve _fileIndex during streaming', async () => {
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });
      
      const events = [
        { type: 'event.1', timestamp: '2026-02-20T10:00:00.000Z' },
        { type: 'event.2', timestamp: '2026-02-20T10:00:01.000Z' },
        { type: 'event.3', timestamp: '2026-02-20T10:00:02.000Z' }
      ];
      
      const content = events.map(e => JSON.stringify(e)).join('\n');
      await fs.promises.writeFile(path.join(sessionDir, 'events.jsonl'), content);
      await fs.promises.writeFile(path.join(sessionDir, 'workspace.yaml'), 'repo: test\n');
      
      const result = await service.getSessionEvents(sessionId);
      
      expect(result[0]._fileIndex).toBe(0);
      expect(result[1]._fileIndex).toBe(1);
      expect(result[2]._fileIndex).toBe(2);
    });
  });

  describe('getSessionWithEvents', () => {
    const sessionId = 'complete-session';

    it('should return both metadata and events', async () => {
      const sessionDir = path.join(tmpDir, sessionId);
      await fs.promises.mkdir(sessionDir, { recursive: true });
      
      await fs.promises.writeFile(
        path.join(sessionDir, 'workspace.yaml'),
        'repo: test-repo\nsummary: Test Session\ncreated_at: 2026-02-20T10:00:00Z\n'
      );
      
      const events = [
        { type: 'session.start', timestamp: '2026-02-20T10:00:00.000Z' },
        { type: 'user.message', timestamp: '2026-02-20T10:00:01.000Z', data: { text: 'Hello' } }
      ];
      
      const content = events.map(e => JSON.stringify(e)).join('\n');
      await fs.promises.writeFile(path.join(sessionDir, 'events.jsonl'), content);
      
      const result = await service.getSessionWithEvents(sessionId);
      
      expect(result).not.toBeNull();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.summary).toBe('Test Session');
      expect(result.events).toHaveLength(2);
    });

    it('should return null for non-existent session', async () => {
      const result = await service.getSessionWithEvents('non-existent-id');
      expect(result).toBeNull();
    });
  });
});
