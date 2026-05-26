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
    test('should add custom directory and show sessions', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Click copilot pill first
      const copilotPill = page.locator('[data-testid="source-pill"]', { hasText: /copilot/i }).first();
      if (await copilotPill.isVisible()) {
        await copilotPill.click();
        await page.waitForLoadState('networkidle');
      }

      // Intercept the prompt dialog and provide our fixture path
      page.on('dialog', async dialog => {
        await dialog.accept(CUSTOM_DIR);
      });

      // Click the add-dir button
      const addBtn = page.locator('[data-testid="add-dir-btn"]');
      await addBtn.click();

      // Wait for custom dir sessions to load
      await page.waitForTimeout(2000);

      // The custom dir path should appear in the UI
      await expect(page.locator(`text=${CUSTOM_DIR}`).first()).toBeVisible();

      // The nested session should appear in the list
      const sessionCard = page.locator(`[data-testid="session-card"]`).filter({ hasText: NESTED_SESSION_ID });
      await expect(sessionCard.first()).toBeVisible({ timeout: 10000 });
    });

    test('custom dir session card link should include dir param', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Set up custom dir in localStorage before navigating
      await page.evaluate((dir) => {
        localStorage.setItem('session-viewer-custom-dirs', JSON.stringify({
          'copilot': [{ dir, color: '#ff6b6b' }]
        }));
      }, CUSTOM_DIR);

      // Reload to pick up localStorage
      await page.reload();
      await page.waitForLoadState('networkidle');

      const copilotPill = page.locator('[data-testid="source-pill"]', { hasText: /copilot/i }).first();
      if (await copilotPill.isVisible()) {
        await copilotPill.click();
        await page.waitForLoadState('networkidle');
      }

      await page.waitForTimeout(2000);

      // Find the custom dir session card and verify its href includes dir=
      const sessionCard = page.locator(`[data-testid="session-card"]`).filter({ hasText: NESTED_SESSION_ID }).first();
      if (await sessionCard.isVisible({ timeout: 5000 })) {
        const href = await sessionCard.getAttribute('href');
        expect(href).toContain('dir=');
        expect(href).toContain(encodeURIComponent(CUSTOM_DIR));
      }
    });

    test('should navigate to custom dir session and load events', async ({ page }) => {
      // Set up custom dir in localStorage
      await page.goto('/');
      await page.evaluate((dir) => {
        localStorage.setItem('session-viewer-custom-dirs', JSON.stringify({
          'copilot': [{ dir, color: '#ff6b6b' }]
        }));
      }, CUSTOM_DIR);

      // Navigate directly to the session detail with dir param
      await page.goto(`/#/copilot-cli/session/${NESTED_SESSION_ID}?dir=${encodeURIComponent(CUSTOM_DIR)}`);
      await page.waitForLoadState('networkidle');

      // Should show session content, not an error
      await page.waitForTimeout(3000);
      const errorText = page.locator('text=Session not found');
      const hasError = await errorText.isVisible().catch(() => false);
      expect(hasError).toBeFalsy();

      // Should have loaded events (look for turn elements or event content)
      const content = await page.textContent('body');
      expect(content.length).toBeGreaterThan(100);
    });

    test('should remove custom directory', async ({ page }) => {
      await page.goto('/');
      await page.evaluate((dir) => {
        localStorage.setItem('session-viewer-custom-dirs', JSON.stringify({
          'copilot': [{ dir, color: '#ff6b6b' }]
        }));
      }, CUSTOM_DIR);

      await page.reload();
      await page.waitForLoadState('networkidle');

      const copilotPill = page.locator('[data-testid="source-pill"]', { hasText: /copilot/i }).first();
      if (await copilotPill.isVisible()) {
        await copilotPill.click();
        await page.waitForLoadState('networkidle');
      }

      // Verify custom dir is shown
      await expect(page.locator(`text=${CUSTOM_DIR}`).first()).toBeVisible({ timeout: 5000 });

      // Click remove button
      const removeBtn = page.locator(`text=${CUSTOM_DIR}`).locator('..').locator('button:has-text("×")');
      await removeBtn.click();

      // Custom dir should be gone
      await page.waitForTimeout(1000);
      await expect(page.locator(`text=${CUSTOM_DIR}`)).not.toBeVisible();

      // localStorage should be updated
      const dirs = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('session-viewer-custom-dirs') || '{}');
      });
      expect(dirs.copilot || []).toHaveLength(0);
    });
  });
});
