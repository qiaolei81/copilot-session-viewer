// __tests__/e2e/import-agents.spec.js
// E2E tests for session import UI interactions.

const { test, expect } = require('./fixtures');

test.describe('Session Import - UI', () => {
  test('import button opens file chooser dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const importLink = page.locator('[data-testid="import-link"]');
    await expect(importLink).toBeVisible();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await importLink.click();
    const fileChooser = await fileChooserPromise;
    expect(fileChooser).toBeTruthy();
  });

  test('supported formats hint visible on homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hint = page.locator('[data-testid="import-formats-hint"]');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Copilot');
    await expect(hint).toContainText('Claude');
    await expect(hint).toContainText('Pi-Mono');
  });
});
