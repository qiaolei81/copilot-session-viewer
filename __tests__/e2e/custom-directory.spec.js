// @ts-check
const { test, expect, getJsonWithRetry } = require('./fixtures');
const path = require('path');

const CUSTOM_DIR = path.resolve(__dirname, '../fixtures/custom-dir');
const NESTED_SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

test.describe('Custom Directory Support', () => {
  test.describe('API', () => {
    test('should list sessions from custom directory via ?dir= param', async ({ request }) => {
      const data = await getJsonWithRetry(request, `/api/copilot-cli/sessions?dir=${encodeURIComponent(CUSTOM_DIR)}`);
      const sessions = Array.isArray(data) ? data : (data.sessions || []);
      expect(sessions.length).toBeGreaterThanOrEqual(1);
      const found = sessions.find(s => s.id === NESTED_SESSION_ID);
      expect(found).toBeTruthy();
    });

    test('should load session metadata from custom directory', async ({ request }) => {
      const resp = await request.get(`/api/copilot-cli/sessions/${NESTED_SESSION_ID}?dir=${encodeURIComponent(CUSTOM_DIR)}`);
      expect(resp.ok()).toBeTruthy();
      const data = await resp.json();
      expect(data.id).toBe(NESTED_SESSION_ID);
    });

    test('should load session events from custom directory', async ({ request }) => {
      const resp = await request.get(`/api/copilot-cli/sessions/${NESTED_SESSION_ID}/events?dir=${encodeURIComponent(CUSTOM_DIR)}`);
      expect(resp.ok()).toBeTruthy();
      const data = await resp.json();
      const events = Array.isArray(data) ? data : (data.events || []);
      expect(events.length).toBeGreaterThan(0);
    });

    test('should return 404 for non-existent session in custom dir', async ({ request }) => {
      const resp = await request.get(`/api/copilot-cli/sessions/00000000-0000-0000-0000-000000000000?dir=${encodeURIComponent(CUSTOM_DIR)}`);
      expect(resp.status()).toBe(404);
    });
  });

  test.describe('UI', () => {
    test('should show custom dir sessions when set via localStorage', async ({ page }) => {
      await page.goto('/');

      // Pre-set custom dir in localStorage
      await page.evaluate((dir) => {
        localStorage.setItem('customDirs', JSON.stringify({
          'copilot': [{ dir, color: '#ff6b6b' }]
        }));
      }, CUSTOM_DIR);

      await page.reload();
      await page.waitForLoadState('networkidle');

      // Select copilot source
      const copilotPill = page.locator('[data-testid="source-pill"]', { hasText: /copilot/i }).first();
      if (await copilotPill.isVisible({ timeout: 3000 }).catch(() => false)) {
        await copilotPill.click();
        await page.waitForLoadState('networkidle');
      }

      // Custom dir path should appear
      await expect(page.locator('.font-mono', { hasText: 'custom-dir' }).first()).toBeVisible({ timeout: 10000 });

      // The nested session should appear
      const sessionCard = page.locator('[data-testid="session-card"]').filter({ hasText: /Placeholder task/i });
      await expect(sessionCard.first()).toBeVisible({ timeout: 10000 });
    });

    test('custom dir session card link should include dir param', async ({ page }) => {
      await page.goto('/');
      await page.evaluate((dir) => {
        localStorage.setItem('customDirs', JSON.stringify({
          'copilot': [{ dir, color: '#ff6b6b' }]
        }));
      }, CUSTOM_DIR);

      await page.reload();
      await page.waitForLoadState('networkidle');

      const copilotPill = page.locator('[data-testid="source-pill"]', { hasText: /copilot/i }).first();
      if (await copilotPill.isVisible({ timeout: 3000 }).catch(() => false)) {
        await copilotPill.click();
        await page.waitForLoadState('networkidle');
      }

      // Find the custom dir session card and verify its href includes dir=
      const sessionCard = page.locator('[data-testid="session-card"]').filter({ hasText: /Placeholder task/i }).first();
      await expect(sessionCard).toBeVisible({ timeout: 10000 });
      const href = await sessionCard.getAttribute('href');
      expect(href).toContain('dir=');
    });

    test('should navigate to custom dir session and load events', async ({ page }) => {
      // Navigate directly to the session detail with dir param
      await page.goto(`/#/copilot-cli/session/${NESTED_SESSION_ID}?dir=${encodeURIComponent(CUSTOM_DIR)}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // Should show session content, not an error
      const errorText = page.locator('text=Session not found');
      const hasError = await errorText.isVisible().catch(() => false);
      expect(hasError).toBeFalsy();

      // Should have loaded events
      const content = await page.textContent('body');
      expect(content.length).toBeGreaterThan(100);
    });

    test('should remove custom directory', async ({ page }) => {
      await page.goto('/');
      await page.evaluate((dir) => {
        localStorage.setItem('customDirs', JSON.stringify({
          'copilot': [{ dir, color: '#ff6b6b' }]
        }));
      }, CUSTOM_DIR);

      await page.reload();
      await page.waitForLoadState('networkidle');

      const copilotPill = page.locator('[data-testid="source-pill"]', { hasText: /copilot/i }).first();
      if (await copilotPill.isVisible({ timeout: 3000 }).catch(() => false)) {
        await copilotPill.click();
        await page.waitForLoadState('networkidle');
      }

      // Verify custom dir is shown
      const dirLabel = page.locator('.font-mono', { hasText: 'custom-dir' }).first();
      await expect(dirLabel).toBeVisible({ timeout: 10000 });

      // Click remove button
      const removeBtn = page.locator('[data-testid="remove-dir-btn"]').first();
      await removeBtn.click();

      // Custom dir should be gone
      await expect(dirLabel).not.toBeVisible({ timeout: 5000 });

      // localStorage should be updated
      const dirs = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('customDirs') || '{}');
      });
      expect(dirs.copilot || []).toHaveLength(0);
    });
  });
});
