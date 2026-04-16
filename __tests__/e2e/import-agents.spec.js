// __tests__/e2e/import-agents.spec.js
// E2E tests for session import across different agent formats:
// Copilot, Claude, Pi-Mono — covers API and UI entry points.

const { test, expect } = require('./fixtures');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ── helpers ───────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'csv-e2e-'));
}

/** Zip a directory into a Buffer using the system `zip` command */
function zipDir(dir) {
  const zipPath = path.join(os.tmpdir(), `e2e-import-${Date.now()}.zip`);
  execSync(`cd "${dir}" && zip -r "${zipPath}" . -x "*.DS_Store"`, { stdio: 'pipe' });
  const buf = fs.readFileSync(zipPath);
  fs.rmSync(zipPath, { force: true });
  return buf;
}

/** POST a zip buffer to /session/import and return { status, body } */
async function postImport(request, zipBuffer, filename = 'session.zip') {
  const resp = await request.fetch('/session/import', {
    method: 'POST',
    multipart: {
      zipFile: {
        name: filename,
        mimeType: 'application/zip',
        buffer: zipBuffer,
      },
    },
  });
  return { status: resp.status(), body: await resp.json() };
}

// ── session builders ──────────────────────────────────────────────────────────

function buildCopilotSession(dir, sessionId = `e2e-copilot-${Date.now()}`) {
  const sessionDir = path.join(dir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const now = Date.now();
  const events = [
    {
      type: 'request',
      timestamp: new Date(now).toISOString(),
      requestId: 'req-001',
      conversationId: sessionId,
      message: { role: 'user', content: 'Hello from Copilot e2e test' },
      workspaceFolder: '/workspace/test',
    },
    {
      type: 'response',
      timestamp: new Date(now + 1000).toISOString(),
      requestId: 'req-001',
      conversationId: sessionId,
      message: { role: 'assistant', content: 'Hello! I am GitHub Copilot.', model: 'gpt-4o' },
    },
  ];

  fs.writeFileSync(
    path.join(sessionDir, 'events.jsonl'),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n'
  );
  return dir;
}

function buildClaudeSession(dir, sessionId = `e2e-claude-${Date.now()}`) {
  // Claude import format: {sessionId}.jsonl at the root of the zip
  const now = Date.now();
  const userUuid = 'uuid-user-001';
  const assistantUuid = 'uuid-assistant-001';

  const events = [
    {
      type: 'user',
      uuid: userUuid,
      parentUuid: null,
      sessionId,
      timestamp: new Date(now).toISOString(),
      version: '1.0.0',
      cwd: '/workspace',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello from Claude e2e test' }] },
    },
    {
      type: 'assistant',
      uuid: assistantUuid,
      parentUuid: userUuid,
      sessionId,
      timestamp: new Date(now + 2000).toISOString(),
      message: {
        role: 'assistant',
        model: 'claude-opus-4.6',
        content: [{ type: 'text', text: 'Hello! I am Claude.' }],
      },
    },
  ];

  // Top-level JSONL file (Claude import signature)
  fs.writeFileSync(
    path.join(dir, `${sessionId}.jsonl`),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n'
  );
  return dir;
}

function buildPiMonoSession(dir, sessionId = `e2e-pimono-${Date.now()}`) {
  // PiMono import format: {timestamp}_{sessionId}.jsonl with first line type=session
  const now = Date.now();
  const ts = new Date(now).toISOString().replace(/:/g, '-').replace('.', '-').replace('Z', 'Z');
  const filename = `${ts}_${sessionId}.jsonl`;

  const events = [
    {
      type: 'session',
      sessionId,
      timestamp: new Date(now).toISOString(),
    },
    {
      type: 'message',
      role: 'user',
      timestamp: new Date(now + 100).toISOString(),
      content: 'Hello from Pi-Mono e2e test',
      sessionId,
    },
    {
      type: 'message',
      role: 'assistant',
      timestamp: new Date(now + 1500).toISOString(),
      content: 'Hello! I am Pi.',
      sessionId,
    },
  ];

  fs.writeFileSync(
    path.join(dir, filename),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n'
  );
  return dir;
}

// ── API-level import tests (no browser interaction) ───────────────────────────

test.describe('Session Import - API', () => {
  test('import Copilot session zip → returns success with copilot format', async ({ request }) => {
    const dir = tmpDir();
    try {
      buildCopilotSession(dir);
      const zip = zipDir(dir);
      const { status, body } = await postImport(request, zip, 'copilot-session.zip');

      expect(status, JSON.stringify(body)).toBe(200);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBeTruthy();
      expect(body.format).toBe('copilot');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('import Claude session zip → returns success with claude format', async ({ request }) => {
    const dir = tmpDir();
    try {
      buildClaudeSession(dir);
      const zip = zipDir(dir);
      const { status, body } = await postImport(request, zip, 'claude-session.zip');

      expect(status, JSON.stringify(body)).toBe(200);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBeTruthy();
      expect(body.format).toBe('claude');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('import Pi-Mono session zip → returns success with pi-mono format', async ({ request }) => {
    const dir = tmpDir();
    try {
      buildPiMonoSession(dir);
      const zip = zipDir(dir);
      const { status, body } = await postImport(request, zip, 'pimono-session.zip');

      expect(status, JSON.stringify(body)).toBe(200);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBeTruthy();
      expect(body.format).toBe('pi-mono');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('import unknown format → returns 400 with error', async ({ request }) => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'random.txt'), 'not a session');
      const zip = zipDir(dir);
      const { status, body } = await postImport(request, zip, 'unknown.zip');

      expect([400, 415]).toContain(status);
      expect(body.error || body.code).toBeTruthy();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('upload without file → returns 400', async ({ request }) => {
    const resp = await request.fetch('/session/import', { method: 'POST' });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toBeTruthy();
  });
});

// ── UI-level import tests (browser required) ──────────────────────────────────

test.describe('Session Import - UI', () => {
  test('imported Copilot session appears on homepage after upload', async ({ page, request }) => {
    const dir = tmpDir();
    try {
      buildCopilotSession(dir);
      const zip = zipDir(dir);
      const { status, body } = await postImport(request, zip, 'copilot-session.zip');

      expect(status, JSON.stringify(body)).toBe(200);
      expect(body.success).toBe(true);

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const sessionCards = page.locator('.session-card, [data-session-id]');
      await expect(sessionCards.first()).toBeVisible({ timeout: 10000 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('import button opens file chooser dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const importLink = page.locator('#importLink');
    await expect(importLink).toBeVisible();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await importLink.click();
    const fileChooser = await fileChooserPromise;
    expect(fileChooser).toBeTruthy();
  });
});
