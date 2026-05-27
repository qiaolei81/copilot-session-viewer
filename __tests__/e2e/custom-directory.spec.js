// @ts-check
const { test, expect, getJsonWithRetry } = require('./fixtures');
const path = require('path');

const CUSTOM_DIR = path.resolve(__dirname, '../fixtures/custom-dir');
const NESTED_SESSION_ID = 'b7c5d3e2-4a1f-4b8c-9d2e-1234567890ab';

async function registerCustomDir(request, dirPath) {
  const resp = await request.post('/api/dirs', { data: { path: dirPath } });
  if (!resp.ok()) {
    throw new Error(`Failed to register dir: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

async function clearAllDirs(request) {
  const list = await getJsonWithRetry(request, '/api/dirs');
  for (const d of list) {
    await request.delete(`/api/dirs/${d.id}`);
  }
}

test.describe('Custom Directory Support', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async ({ request }) => {
    await clearAllDirs(request).catch(() => {});
  });

  test.describe('API', () => {
    test('should list sessions from custom directory via ?dirId= param', async ({ request }) => {
      const entry = await registerCustomDir(request, CUSTOM_DIR);
      const data = await getJsonWithRetry(request, `/api/copilot-cli/sessions?dirId=${entry.id}`);
      const sessions = Array.isArray(data) ? data : (data.sessions || []);
      expect(sessions.length).toBeGreaterThanOrEqual(1);
      const found = sessions.find(s => s.id === NESTED_SESSION_ID);
      expect(found).toBeTruthy();
    });

    test('should load session metadata from custom directory', async ({ request }) => {
      const entry = await registerCustomDir(request, CUSTOM_DIR);
      const resp = await request.get(`/api/copilot-cli/sessions/${NESTED_SESSION_ID}?dirId=${entry.id}`);
      expect(resp.ok()).toBeTruthy();
      const data = await resp.json();
      expect(data.id).toBe(NESTED_SESSION_ID);
    });

    test('should load session events from custom directory', async ({ request }) => {
      const entry = await registerCustomDir(request, CUSTOM_DIR);
      const resp = await request.get(`/api/copilot-cli/sessions/${NESTED_SESSION_ID}/events?dirId=${entry.id}`);
      expect(resp.ok()).toBeTruthy();
      const data = await resp.json();
      const events = Array.isArray(data) ? data : (data.events || []);
      expect(events.length).toBeGreaterThan(0);
    });

    test('should return 404 for non-existent session in custom dir', async ({ request }) => {
      const entry = await registerCustomDir(request, CUSTOM_DIR);
      const resp = await request.get(`/api/copilot-cli/sessions/00000000-0000-0000-0000-000000000000?dirId=${entry.id}`);
      expect(resp.status()).toBe(404);
    });
  });

  test.describe('UI', () => {
    test('should show custom dir sessions when set via localStorage', async ({ page, request }) => {
      const entry = await registerCustomDir(request, CUSTOM_DIR);
      await page.goto('/');

      await page.evaluate((e) => {
        localStorage.setItem('customDirsV2', JSON.stringify([
          { id: e.id, label: e.label, path: e.path, color: '#ff6b6b', addedAt: e.addedAt, source: 'copilot' }
        ]));
      }, entry);

      await Promise.all([
        page.waitForResponse(
          r => r.url().includes('/sessions'),
          { timeout: 5000 }
        ).catch(() => null),
        page.reload()
      ]);
      await page.waitForLoadState('networkidle');

      const copilotPill = page.locator('[data-testid="source-pill"]', { hasText: /copilot/i }).first();
      if (await copilotPill.isVisible({ timeout: 3000 }).catch(() => false)) {
        await Promise.all([
          page.waitForResponse(
            r => r.url().includes('/sessions') && r.url().includes('dirId='),
            { timeout: 5000 }
          ).catch(() => null),
          copilotPill.click()
        ]);
        await page.waitForLoadState('networkidle');
      }

      await expect(page.locator('.font-mono', { hasText: 'custom-dir' }).first()).toBeVisible({ timeout: 10000 });

      const sessionCard = page.locator('[data-testid="session-card"]').filter({ hasText: /demo-greeter/i });
      await expect(sessionCard.first()).toBeVisible({ timeout: 10000 });
    });

    test('custom dir session card link should include dirId param', async ({ page, request }) => {
      const entry = await registerCustomDir(request, CUSTOM_DIR);
      await page.goto('/');
      await page.evaluate((e) => {
        localStorage.setItem('customDirsV2', JSON.stringify([
          { id: e.id, label: e.label, path: e.path, color: '#ff6b6b', addedAt: e.addedAt, source: 'copilot' }
        ]));
      }, entry);

      await Promise.all([
        page.waitForResponse(
          r => r.url().includes('/sessions'),
          { timeout: 5000 }
        ).catch(() => null),
        page.reload()
      ]);
      await page.waitForLoadState('networkidle');

      const copilotPill = page.locator('[data-testid="source-pill"]', { hasText: /copilot/i }).first();
      if (await copilotPill.isVisible({ timeout: 3000 }).catch(() => false)) {
        await Promise.all([
          page.waitForResponse(
            r => r.url().includes('/sessions') && r.url().includes('dirId='),
            { timeout: 5000 }
          ).catch(() => null),
          copilotPill.click()
        ]);
        await page.waitForLoadState('networkidle');
      }

      const sessionCard = page.locator('[data-testid="session-card"]').filter({ hasText: /demo-greeter/i }).first();
      await expect(sessionCard).toBeVisible({ timeout: 10000 });
      const href = await sessionCard.getAttribute('href');
      expect(href).toContain('dirId=');
    });

    test('should navigate to custom dir session and load events', async ({ page, request }) => {
      const entry = await registerCustomDir(request, CUSTOM_DIR);
      await page.goto(`/#/copilot-cli/session/${NESTED_SESSION_ID}?dirId=${entry.id}`);
      await page.waitForLoadState('networkidle');
      // Wait for either the session content to render or an error to appear (deterministic, no fixed sleep)
      await Promise.race([
        page.locator('text=Session not found').waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
        page.waitForFunction(() => (document.body.textContent || '').length > 100, null, { timeout: 5000 }).catch(() => null)
      ]);

      const errorText = page.locator('text=Session not found');
      const hasError = await errorText.isVisible().catch(() => false);
      expect(hasError).toBeFalsy();

      const content = await page.textContent('body');
      expect(content.length).toBeGreaterThan(100);
    });

    test('should remove custom directory', async ({ page, request }) => {
      const entry = await registerCustomDir(request, CUSTOM_DIR);
      await page.goto('/');
      await page.evaluate((e) => {
        localStorage.setItem('customDirsV2', JSON.stringify([
          { id: e.id, label: e.label, path: e.path, color: '#ff6b6b', addedAt: e.addedAt, source: 'copilot' }
        ]));
      }, entry);

      await Promise.all([
        page.waitForResponse(
          r => r.url().includes('/sessions'),
          { timeout: 5000 }
        ).catch(() => null),
        page.reload()
      ]);
      await page.waitForLoadState('networkidle');

      const copilotPill = page.locator('[data-testid="source-pill"]', { hasText: /copilot/i }).first();
      if (await copilotPill.isVisible({ timeout: 3000 }).catch(() => false)) {
        await Promise.all([
          page.waitForResponse(
            r => r.url().includes('/sessions') && r.url().includes('dirId='),
            { timeout: 5000 }
          ).catch(() => null),
          copilotPill.click()
        ]);
        await page.waitForLoadState('networkidle');
      }

      const dirLabel = page.locator('.font-mono', { hasText: 'custom-dir' }).first();
      await expect(dirLabel).toBeVisible({ timeout: 10000 });

      const removeBtn = page.locator('[data-testid="remove-dir-btn"]').first();
      await removeBtn.click();

      await expect(dirLabel).not.toBeVisible({ timeout: 5000 });

      const dirs = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('customDirsV2') || '[]');
      });
      expect(dirs).toHaveLength(0);
    });
  });
});
