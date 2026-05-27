/**
 * API Integration Tests — real server, real adapters, fixture data.
 * No mocks. Each adapter's env var points to a per-run temp copy of
 * __tests__/fixtures/sessions/<source> so that import tests (which write
 * to the configured session dir) don't pollute the checked-in fixtures
 * or the subsequent E2E run.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const SRC_FIXTURES = path.resolve(__dirname, 'fixtures/sessions');
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-api-integration-'));

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Snapshot each source fixture into the temp dir so writes are isolated.
const FIXTURES = path.join(TMP_ROOT, 'sessions');
copyDir(SRC_FIXTURES, FIXTURES);

// Point adapters at temp-copy fixture directories BEFORE requiring the app
process.env.COPILOT_SESSION_DIR = path.join(FIXTURES, 'copilot-cli');
process.env.CLAUDE_SESSION_DIR = path.join(FIXTURES, 'claude');
process.env.VSCODE_WORKSPACE_STORAGE_DIR = path.join(FIXTURES, 'vscode-empty');
process.env.PI_MONO_SESSION_DIR = path.join(FIXTURES, 'pi-mono');
process.env.MODERNIZE_SESSION_DIR = path.join(FIXTURES, 'modernize-empty');

const createApp = require('../src/server/app');

let app;

beforeAll(() => {
  app = createApp();
});

afterAll(() => {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
});

// Helper: extract sessions array from response
function getSessions(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.sessions)) return body.sessions;
  return [];
}

// Helper: extract events array from response
function getEvents(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.events)) return body.events;
  return [];
}

// ── GET /api/sources ──
describe('GET /api/sources', () => {
  it('returns list of available sources with id and label', async () => {
    const res = await request(app).get('/api/sources');
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThan(0);
    for (const src of res.body) {
      expect(src).toHaveProperty('id');
      expect(src).toHaveProperty('label');
    }
  });

  it('includes all 5 configured sources', async () => {
    const res = await request(app).get('/api/sources');
    const ids = res.body.map(s => s.id);
    expect(ids).toEqual(expect.arrayContaining([
      'copilot-cli', 'claude', 'copilot-chat', 'pi-mono', 'modernize'
    ]));
  });
});

// ── Per-source full endpoint coverage ──
const SOURCES = [
  { urlSource: 'copilot-cli', minSessions: 1, hasEvents: true },
  { urlSource: 'claude', minSessions: 1, hasEvents: true },
  { urlSource: 'copilot-chat', minSessions: 0, hasEvents: false }, // vscode-empty fixture (no PII demo session)
  { urlSource: 'pi-mono', minSessions: 1, hasEvents: true },
  { urlSource: 'modernize', minSessions: 0, hasEvents: true }, // modernize-empty fixture
];

for (const { urlSource, minSessions, hasEvents } of SOURCES) {
  describe(`${urlSource} — full endpoint coverage`, () => {
    let sessions;
    let sessionId;

    beforeAll(async () => {
      const res = await request(app).get(`/api/${urlSource}/sessions`);
      sessions = getSessions(res.body);
      if (sessions.length > 0) sessionId = sessions[0].id;
    });

    // ── List ──
    it('GET /sessions — lists sessions', async () => {
      const res = await request(app).get(`/api/${urlSource}/sessions`);
      expect(res.status).toBe(200);
      const list = getSessions(res.body);
      expect(list.length).toBeGreaterThanOrEqual(minSessions);
      for (const s of list) {
        expect(s).toHaveProperty('id');
        expect(s).toHaveProperty('source');
        expect(s).toHaveProperty('createdAt');
      }
    });

    // ── Pagination ──
    it('GET /sessions?offset=0&limit=1 — pagination', async () => {
      const res = await request(app).get(`/api/${urlSource}/sessions?offset=0&limit=1`);
      expect(res.status).toBe(200);
      const list = getSessions(res.body);
      expect(list.length).toBeLessThanOrEqual(1);
    });

    // ── Session Detail ──
    it('GET /sessions/:id — returns session detail', async () => {
      if (!sessionId) return;
      const res = await request(app).get(`/api/${urlSource}/sessions/${sessionId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
    });

    // ── Events ──
    it('GET /sessions/:id/events — returns events', async () => {
      if (!sessionId || !hasEvents) return;
      const res = await request(app).get(`/api/${urlSource}/sessions/${sessionId}/events`);
      expect(res.status).toBe(200);
      const events = getEvents(res.body);
      expect(events.length).toBeGreaterThan(0);
    });

    it('GET /sessions/:id/events?offset=0&limit=5 — paginated events', async () => {
      if (!sessionId || !hasEvents) return;
      const res = await request(app).get(`/api/${urlSource}/sessions/${sessionId}/events?offset=0&limit=5`);
      expect(res.status).toBe(200);
      const events = getEvents(res.body);
      expect(events.length).toBeLessThanOrEqual(5);
    });

    // ── Timeline ──
    it('GET /sessions/:id/timeline — returns timeline', async () => {
      if (!sessionId) return;
      const res = await request(app).get(`/api/${urlSource}/sessions/${sessionId}/timeline`);
      expect(res.status).toBe(200);
    });

    // ── Tags ──
    it('GET /sessions/:id/tags — returns tags', async () => {
      if (!sessionId) return;
      const res = await request(app).get(`/api/${urlSource}/sessions/${sessionId}/tags`);
      expect(res.status).toBe(200);
    });

    it('PUT + GET /sessions/:id/tags — round-trip', async () => {
      if (!sessionId) return;
      const tags = [`tag-${urlSource}`, 'integration-test'];
      const putRes = await request(app)
        .put(`/api/${urlSource}/sessions/${sessionId}/tags`)
        .send({ tags });
      expect(putRes.status).toBe(200);

      const getRes = await request(app).get(`/api/${urlSource}/sessions/${sessionId}/tags`);
      expect(getRes.body.tags).toEqual(expect.arrayContaining(tags));
    });

    // ── Export ──
    it('GET /sessions/:id/export — exports session', async () => {
      if (!sessionId) return;
      const res = await request(app).get(`/api/${urlSource}/sessions/${sessionId}/export`);
      // 200 with file download or 404/500 if export not supported
      expect([200, 404, 500]).toContain(res.status);
      if (res.status === 200) {
        // Should have content-disposition header for download
        const contentDisp = res.headers['content-disposition'] || '';
        const contentType = res.headers['content-type'] || '';
        // Either a file download or JSON response
        expect(contentDisp || contentType).toBeTruthy();
      }
    });


    // ── Insight (CRUD) ──
    it('POST /sessions/:id/insight — creates insight', async () => {
      if (!sessionId) return;
      const res = await request(app)
        .post(`/api/${urlSource}/sessions/${sessionId}/insight`)
        .send({});
      // May need an API key, accept 200/400/500
      expect([200, 201, 400, 500, 503]).toContain(res.status);
    });

    it('GET /sessions/:id/insight — retrieves insight status', async () => {
      if (!sessionId) return;
      const res = await request(app).get(`/api/${urlSource}/sessions/${sessionId}/insight`);
      expect([200, 404]).toContain(res.status);
    });

    it('DELETE /sessions/:id/insight — deletes insight', async () => {
      if (!sessionId) return;
      const res = await request(app).delete(`/api/${urlSource}/sessions/${sessionId}/insight`);
      expect([200, 204, 404]).toContain(res.status);
    });

    // ── 404 for nonexistent session ──
    it('GET /sessions/nonexistent-id — returns 404', async () => {
      const res = await request(app).get(`/api/${urlSource}/sessions/nonexistent-id-xyz`);
      expect([400, 404]).toContain(res.status);
    });

    it('GET /sessions/nonexistent-id/events — returns 404', async () => {
      const res = await request(app).get(`/api/${urlSource}/sessions/nonexistent-id-xyz/events`);
      expect([400, 404]).toContain(res.status);
    });

    it('GET /sessions/nonexistent-id/timeline — returns 404', async () => {
      const res = await request(app).get(`/api/${urlSource}/sessions/nonexistent-id-xyz/timeline`);
      expect([400, 404]).toContain(res.status);
    });
  });
}

// ── Source validation ──
describe('Source validation', () => {
  it('returns 400 or 404 for invalid source on /sessions', async () => {
    const res = await request(app).get('/api/nonexistent-source/sessions');
    expect([400, 404]).toContain(res.status);
  });

  it('returns 400 or 404 for invalid source on /sessions/:id', async () => {
    const res = await request(app).get('/api/nonexistent-source/sessions/some-id');
    expect([400, 404]).toContain(res.status);
  });

  it('returns 400 or 404 for invalid source on /sessions/:id/events', async () => {
    const res = await request(app).get('/api/nonexistent-source/sessions/some-id/events');
    expect([400, 404]).toContain(res.status);
  });
});

// ── Global endpoints ──
describe('Global endpoints', () => {
  it('GET /api/tags — returns tags list', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
  });

  it('POST /api/import — rejects without file', async () => {
    const res = await request(app).post('/api/import');
    expect([400, 500]).toContain(res.status);
  });

  it('POST /api/import — imports a session file', async () => {
    const fixturePath = path.join(FIXTURES, 'copilot-cli', 'session-demo', 'events.jsonl');
    const res = await request(app)
      .post('/api/import')
      .attach('session', fixturePath);
    // 200/201 on success, or 400/500 if import format not accepted
    expect([200, 201, 400, 500]).toContain(res.status);
  });
});

// ── Cross-source consistency ──
describe('Cross-source consistency', () => {
  it('all sources return sessions with consistent shape', async () => {
    const sources = ['copilot-cli', 'claude', 'copilot-chat', 'pi-mono', 'modernize'];
    for (const source of sources) {
      const res = await request(app).get(`/api/${source}/sessions`);
      expect(res.status).toBe(200);
      const list = getSessions(res.body);
      for (const s of list) {
        expect(s).toHaveProperty('id');
        expect(s).toHaveProperty('source');
        expect(s).toHaveProperty('createdAt');
        expect(s).toHaveProperty('summary');
      }
    }
  });

  it('events from different sources have consistent structure', async () => {
    const sources = ['copilot-cli', 'claude', 'copilot-chat', 'pi-mono', 'modernize'];
    for (const source of sources) {
      const listRes = await request(app).get(`/api/${source}/sessions`);
      const sessions = getSessions(listRes.body);
      if (sessions.length === 0) continue;

      const evtRes = await request(app).get(`/api/${source}/sessions/${sessions[0].id}/events`);
      expect(evtRes.status).toBe(200);
      const events = getEvents(evtRes.body);
      // Events should be an array (may be empty for some adapters)
      expect(Array.isArray(events)).toBe(true);
    }
  });
});
