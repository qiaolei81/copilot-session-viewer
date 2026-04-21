// __tests__/e2e/import-agents.spec.js
// E2E tests for session import across different agent formats.
//
// Copilot: full export→import round-trip (seed → /session/:id/share → /session/import)
// Claude, Pi-Mono: fixture zip matching each adapter's detectImportCandidate format

const { test, expect } = require('./fixtures');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ── request helpers ───────────────────────────────────────────────────────────

/** POST a zip buffer to /session/import */
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

/** Export a Copilot session via /session/:id/share and return zip Buffer */
async function exportCopilotSession(request, sessionId) {
  const resp = await request.fetch(`/session/${sessionId}/share`);
  expect(resp.status(), `export ${sessionId} failed`).toBe(200);
  return Buffer.from(await resp.body());
}

// ── session dirs ──────────────────────────────────────────────────────────────

const COPILOT_DIR = process.env.SESSION_DIR ||
  path.join(os.homedir(), '.copilot', 'session-state');

// ── session seeders ───────────────────────────────────────────────────────────

/** Seed a Copilot session directly into SESSION_DIR; return sessionId + cleanup path */
function seedCopilotSession() {
  const sessionId = `e2e-copilot-${Date.now()}`;
  const sessionDir = path.join(COPILOT_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const now = Date.now();
  const events = [
    {
      type: 'request',
      timestamp: new Date(now).toISOString(),
      requestId: 'req-001',
      conversationId: sessionId,
      message: { role: 'user', content: 'Hello from Copilot e2e export-import test' },
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
  return { sessionId, cleanupPath: sessionDir };
}

/** Build a Claude-format zip buffer (top-level {sessionId}.jsonl) */
function buildClaudeZip() {
  const sessionId = `e2e-claude-${Date.now()}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-e2e-claude-'));
  const now = Date.now();

  const events = [
    {
      type: 'user',
      uuid: 'uuid-u1',
      parentUuid: null,
      sessionId,
      timestamp: new Date(now).toISOString(),
      version: '1.0.0',
      cwd: '/workspace',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello from Claude e2e test' }] },
    },
    {
      type: 'assistant',
      uuid: 'uuid-a1',
      parentUuid: 'uuid-u1',
      sessionId,
      timestamp: new Date(now + 2000).toISOString(),
      message: {
        role: 'assistant',
        model: 'claude-opus-4.6',
        content: [{ type: 'text', text: 'Hello! I am Claude.' }],
      },
    },
  ];
  fs.writeFileSync(
    path.join(dir, `${sessionId}.jsonl`),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n'
  );

  const zipPath = path.join(os.tmpdir(), `e2e-claude-${Date.now()}.zip`);
  execSync(`cd "${dir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
  const buf = fs.readFileSync(zipPath);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  return { buf, sessionId };
}

/** Build a Pi-Mono-format zip buffer ({ISO-ts}_{sessionId}.jsonl, first line type=session) */
function buildPiMonoZip() {
  const sessionId = `e2e-pimono-${Date.now()}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-e2e-pimono-'));
  const now = Date.now();
  const ts = new Date(now).toISOString().replace(/:/g, '-').replace('.', '-');
  const filename = `${ts}_${sessionId}.jsonl`;

  const events = [
    { type: 'session', sessionId, timestamp: new Date(now).toISOString() },
    { type: 'message', role: 'user', timestamp: new Date(now + 100).toISOString(), content: 'Hello from Pi-Mono e2e test', sessionId },
    { type: 'message', role: 'assistant', timestamp: new Date(now + 1500).toISOString(), content: 'Hello! I am Pi.', sessionId },
  ];
  fs.writeFileSync(
    path.join(dir, filename),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n'
  );

  const zipPath = path.join(os.tmpdir(), `e2e-pimono-${Date.now()}.zip`);
  execSync(`cd "${dir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
  const buf = fs.readFileSync(zipPath);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  return { buf, sessionId };
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('Session Import - Copilot (export→import round-trip)', () => {
  test('seed → export zip → import → format=copilot', async ({ request }) => {
    const { sessionId, cleanupPath } = seedCopilotSession();
    try {
      // Export via /session/:id/share
      const zip = await exportCopilotSession(request, sessionId);
      expect(zip.length).toBeGreaterThan(0);

      // Delete original so import doesn't 409
      fs.rmSync(cleanupPath, { recursive: true, force: true });

      const { status, body } = await postImport(request, zip, `${sessionId}.zip`);
      expect(status, JSON.stringify(body)).toBe(200);
      expect(body.success).toBe(true);
      expect(body.format).toBe('copilot');
    } finally {
      fs.rmSync(cleanupPath, { recursive: true, force: true });
      // Also clean up re-imported session
      const reimported = path.join(COPILOT_DIR, sessionId);
      fs.rmSync(reimported, { recursive: true, force: true });
    }
  });
});

test.describe('Session Import - Claude (fixture zip)', () => {
  test('import Claude session zip → format=claude', async ({ request }) => {
    const { buf, sessionId } = buildClaudeZip();
    const { status, body } = await postImport(request, buf, `${sessionId}.zip`);
    // Accept 200 (success) or 409 (session already exists)
    if (status !== 409) {
      expect(status, JSON.stringify(body)).toBe(200);
      expect(body.success).toBe(true);
      expect(body.format).toBe('claude');
    }
  });
});

test.describe('Session Import - Pi-Mono (fixture zip)', () => {
  test('import Pi-Mono session zip → format=pi-mono', async ({ request }) => {
    const { buf, sessionId } = buildPiMonoZip();
    const { status, body } = await postImport(request, buf, `${sessionId}.zip`);
    if (status !== 409) {
      expect(status, JSON.stringify(body)).toBe(200);
      expect(body.success).toBe(true);
      expect(body.format).toBe('pi-mono');
    }
  });
});

test.describe('Session Import - Edge Cases', () => {
  test('unknown format zip → returns 400 or 415', async ({ request }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-e2e-unk-'));
    try {
      fs.writeFileSync(path.join(dir, 'random.txt'), 'not a session');
      const zipPath = path.join(os.tmpdir(), `e2e-unk-${Date.now()}.zip`);
      execSync(`cd "${dir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
      const zip = fs.readFileSync(zipPath);
      fs.rmSync(zipPath, { force: true });

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

test.describe('Session Import - UI', () => {
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

  test('supported formats hint visible on homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hint = page.locator('.import-formats-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Copilot');
    await expect(hint).toContainText('Claude');
    await expect(hint).toContainText('Pi-Mono');
  });
});
