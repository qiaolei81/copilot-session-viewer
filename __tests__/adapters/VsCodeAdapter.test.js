const fs = require('fs');
const path = require('path');
const os = require('os');
const VsCodeAdapter = require('../../src/server/adapters/VsCodeAdapter');

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

  it('reads transcript JSONL events (copilot-agent format)', async () => {
    const sessionFile = path.join(tmpDir, 'session.jsonl');
    const events = [
      { type: 'user.message', timestamp: '2026-02-20T10:00:00.000Z', data: { message: 'Read the file' } },
      { type: 'assistant.message', timestamp: '2026-02-20T10:00:01.000Z', data: { message: 'Reading...' } },
      { type: 'tool.execution_start', timestamp: '2026-02-20T10:00:01.500Z', data: { toolCallId: 't1', toolName: 'copilot_readFile', arguments: { fsPath: '/repo/README.md' } } },
      { type: 'tool.execution_complete', timestamp: '2026-02-20T10:00:02.000Z', data: { toolCallId: 't1', toolName: 'copilot_readFile', result: 'README content' } },
    ];
    await fs.promises.writeFile(sessionFile, events.map(e => JSON.stringify(e)).join('\n'));

    const result = await adapter.readEvents({
      id: 'test-transcript',
      filePath: sessionFile,
      _isTranscript: true,
    }, null);

    expect(result).toHaveLength(4);
    expect(result[0].type).toBe('user.message');
    expect(result[1].type).toBe('assistant.message');
    expect(result[2].type).toBe('tool.execution_start');
    expect(result[3].type).toBe('tool.execution_complete');
  });

  it('buildTimeline returns null to fall through to copilot timeline builder', () => {
    const timeline = adapter.buildTimeline([], { source: 'vscode' });
    expect(timeline).toBeNull();
  });

  it('scans transcripts directory for JSONL sessions', async () => {
    // Set up directory structure: <hash>/GitHub.copilot-chat/transcripts/session.jsonl
    const hash = 'abc123';
    const transcriptsDir = path.join(tmpDir, hash, 'GitHub.copilot-chat', 'transcripts');
    await fs.promises.mkdir(transcriptsDir, { recursive: true });

    const events = [
      { type: 'user.message', timestamp: '2026-02-20T10:00:00.000Z', data: { message: 'Hello' } },
      { type: 'assistant.message', timestamp: '2026-02-20T10:00:01.000Z', data: { message: 'Hi' } },
    ];
    await fs.promises.writeFile(
      path.join(transcriptsDir, 'test-session-id.jsonl'),
      events.map(e => JSON.stringify(e)).join('\n')
    );

    const sessions = await adapter.scanEntries(tmpDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('test-session-id');
    expect(sessions[0].source).toBe('vscode');
    expect(sessions[0]._isTranscript).toBe(true);
  });

  it('findById locates transcript session', async () => {
    const hash = 'def456';
    const transcriptsDir = path.join(tmpDir, hash, 'GitHub.copilot-chat', 'transcripts');
    await fs.promises.mkdir(transcriptsDir, { recursive: true });

    const events = [
      { type: 'user.message', timestamp: '2026-02-20T10:00:00.000Z', data: { message: 'Test' } },
      { type: 'assistant.message', timestamp: '2026-02-20T10:00:01.000Z', data: { message: 'OK' } },
    ];
    await fs.promises.writeFile(
      path.join(transcriptsDir, 'find-me.jsonl'),
      events.map(e => JSON.stringify(e)).join('\n')
    );

    const session = await adapter.findById('find-me', tmpDir);
    expect(session).not.toBeNull();
    expect(session.id).toBe('find-me');
    expect(session.source).toBe('vscode');
  });

  it('returns empty array when no transcript sessions exist', async () => {
    const hash = 'empty123';
    await fs.promises.mkdir(path.join(tmpDir, hash), { recursive: true });

    const sessions = await adapter.scanEntries(tmpDir);
    expect(sessions).toHaveLength(0);
  });
});
