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
      const content = events.map(e => JSON.stringify(e)).join('\n');
      await fs.promises.writeFile(path.join(sessionDir, 'events.jsonl'), content);
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

      // Events without timestamps get time=0, so they sort to the front,
      // preserving their relative file order among themselves
      expect(events[0].type).toBe('event.no_ts');
      expect(events[1].type).toBe('event.null_ts');
      expect(events[2].type).toBe('event.b');
      expect(events[3].type).toBe('event.a');
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
});
