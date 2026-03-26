const fs = require('fs');
const path = require('path');
const os = require('os');
const VsCodeAdapter = require('../../src/adapters/VsCodeAdapter');

describe('VsCodeAdapter', () => {
  let adapter;
  let tmpDir;

  beforeEach(async () => {
    adapter = new VsCodeAdapter();
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-adapter-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('replays JSONL mutations with truncation and delete semantics', () => {
    const sessionJson = adapter._parseJsonl([
      JSON.stringify({
        kind: 0,
        v: {
          sessionId: 'test-123',
          tempField: 'remove-me',
          requests: [{ requestId: 'req-1' }, { requestId: 'req-2' }, { requestId: 'req-3' }]
        }
      }),
      JSON.stringify({
        kind: 2,
        k: ['requests'],
        v: [{ requestId: 'req-4' }],
        i: 1
      }),
      JSON.stringify({
        kind: 3,
        k: ['tempField']
      })
    ].join('\n'), 'session.jsonl');

    expect(sessionJson.requests).toHaveLength(2);
    expect(sessionJson.requests[0].requestId).toBe('req-1');
    expect(sessionJson.requests[1].requestId).toBe('req-4');
    expect(sessionJson.tempField).toBeUndefined();
  });

  it('reads events through the custom pipeline and expands tool executions', async () => {
    const sessionFile = path.join(tmpDir, 'session.json');
    await fs.promises.writeFile(sessionFile, JSON.stringify({
      sessionId: 'vscode-events',
      creationDate: '2026-02-20T10:00:00.000Z',
      requests: [{
        requestId: 'req-1',
        timestamp: '2026-02-20T10:01:00.000Z',
        message: { text: 'Read the file' },
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

    const events = await adapter.readEvents({
      id: 'vscode-events',
      filePath: sessionFile
    }, null);

    expect(events.some(event => event.type === 'assistant.message' && event.data?.tools?.length > 0)).toBe(true);
    expect(events.some(event => event.type === 'tool.execution_start')).toBe(true);
    expect(events.some(event => event.type === 'tool.execution_complete')).toBe(true);
  });

  it('reads pretty-printed json session files', async () => {
    const sessionFile = path.join(tmpDir, 'pretty-session.json');
    await fs.promises.writeFile(sessionFile, JSON.stringify({
      sessionId: 'pretty-json',
      creationDate: '2026-02-20T10:00:00.000Z',
      requests: [{
        requestId: 'req-1',
        timestamp: '2026-02-20T10:01:00.000Z',
        message: { text: 'Hello' },
        modelId: 'gpt-4',
        response: [
          { kind: 'markdownContent', content: { value: 'Hi there' } }
        ]
      }]
    }, null, 2));

    const events = await adapter.readEvents({
      id: 'pretty-json',
      filePath: sessionFile
    }, null);

    expect(events.some(event => event.type === 'user.message')).toBe(true);
    expect(events.some(event => event.type === 'assistant.message')).toBe(true);
  });

  it('builds a vscode timeline with assistant turns, tools, and subagents', () => {
    const timeline = adapter.buildTimeline([
      {
        type: 'user.message',
        timestamp: '2026-02-20T10:00:00.000Z',
        data: { message: 'Please inspect the file' }
      },
      {
        type: 'assistant.message',
        timestamp: '2026-02-20T10:00:02.000Z',
        data: {
          message: 'Done',
          tools: [{
            id: 'tool-1',
            name: 'copilot_readFile',
            startTime: '2026-02-20T10:00:01.000Z',
            endTime: '2026-02-20T10:00:02.000Z',
            status: 'completed',
            input: { file: 'README.md' },
            result: 'README.md'
          }],
          subAgentId: 'agent-1',
          subAgentName: 'reviewer'
        }
      }
    ], { source: 'vscode' });

    expect(timeline.turns).toHaveLength(1);
    expect(timeline.turns[0].assistantTurns).toHaveLength(1);
    expect(timeline.turns[0].assistantTurns[0].tools).toHaveLength(1);
    expect(timeline.turns[0].subagents).toEqual([
      expect.objectContaining({ id: 'agent-1', name: 'reviewer' })
    ]);
    expect(timeline.summary.totalTools).toBe(1);
    expect(timeline.summary.totalSubagents).toBe(1);
  });
});

