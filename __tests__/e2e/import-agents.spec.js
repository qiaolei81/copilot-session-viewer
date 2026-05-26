// __tests__/e2e/import-agents.spec.js
// E2E tests for session import UI interactions.

const { test, expect } = require('./fixtures');

test.describe('Session Import - UI', () => {
  test('import button opens file chooser dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const importLink = page.locator('[data-testid="import-btn"]');
    await expect(importLink).toBeVisible();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await importLink.click();
    const fileChooser = await fileChooserPromise;
    expect(fileChooser).toBeTruthy();
  });

  test('import and add-dir buttons visible on homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="import-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-dir-btn"]')).toBeVisible();
  });
});
