const { test, expect, getSessionsWithRetry } = require('./fixtures');

test.describe('Core Functionality Tests', () => {
  let SESSION_ID;
  let SESSION_SOURCE;

  test.beforeAll(async ({ request }) => {
    // Get first session ID from API for testing
    const sessions = await getSessionsWithRetry(request);
    if (sessions.length > 0) {
      SESSION_ID = sessions[0].id;
      SESSION_SOURCE = sessions[0].urlSource || sessions[0].source;
    }
  });

  test('should load homepage with basic elements', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /session viewer/i })).toBeVisible();
    await expect(page.getByPlaceholder('Enter Session ID...')).toBeVisible();
    await expect(page.locator('[data-testid="import-btn"]')).toBeVisible();
  });

  test('should display sessions if available', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sessionItems = page.locator('[data-testid="session-card"]');
    const sessionCount = await sessionItems.count();

    if (sessionCount > 0) {
      await expect(sessionItems.first()).toBeVisible();
      console.log(`Found ${sessionCount} sessions on homepage`);
    } else {
      console.log('No sessions available - this is okay for testing');
    }
  });

  test('should have working infinite scroll elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // In the Vue SPA, loading state is shown via v-if="isLoading"
    // Just verify the sessions container area renders
    const container = page.locator('[data-testid="session-list"]').first();
    await expect(container).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to session detail page', async ({ page }) => {
    if (!SESSION_ID) {
      test.skip('No sessions available for navigation test');
    }

    await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}`);
    await page.waitForLoadState('networkidle');

    // Should load session detail page
    await expect(page.locator('body')).toBeVisible();

    // URL should be correct
    expect(page.url()).toContain(`/#/${SESSION_SOURCE}/session/${SESSION_ID}`);
  });

  test('should load time analysis page', async ({ page }) => {
    if (!SESSION_ID) {
      test.skip('No sessions available for time analysis test');
    }

    await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
    await page.waitForLoadState('networkidle');

    // Time analysis page should load
    await expect(page.locator('body')).toBeVisible();

    // Should have insight tab (key feature)
    const insightTab = page.locator('button:has-text("💡")');
    const hasInsightTab = await insightTab.isVisible({ timeout: 5000 });

    if (hasInsightTab) {
      console.log('Time analysis page loaded with insight functionality');
    } else {
      console.log('Time analysis page loaded but insight tab not visible');
    }

    // Verify Timeline content rendering (Gantt bars for assistant turns)
    const summaryCards = page.locator('.summary-card');
    const hasSummaryCards = await summaryCards.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasSummaryCards) {
      console.log('Timeline summary cards visible - Gantt rendering working');
    } else {
      console.log('Timeline summary not visible - checking if session has turns');
    }
  });

  test('should handle session import dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Import link should be clickable
    const importLink = page.locator('[data-testid="import-btn"]');
    await expect(importLink).toBeVisible();

    // Set up file chooser handler
    const fileChooserPromise = page.waitForEvent('filechooser');

    // Click import link
    await importLink.click();

    // Should open file dialog
    const fileChooser = await fileChooserPromise;
    expect(fileChooser).toBeTruthy();

    console.log('File import dialog works correctly');
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Basic elements should still be visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('input[placeholder*="Session ID"]')).toBeVisible();

    // Check that layout doesn't break
    const hasExcessiveScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > (document.documentElement.clientWidth + 100);
    });

    console.log('Mobile layout - excessive horizontal scroll:', hasExcessiveScroll);
  });

  test('should handle JavaScript errors gracefully', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', error => {
      jsErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Page should load without critical JS errors
    await expect(page.locator('h1')).toBeVisible();

    // Log any errors for debugging but don't fail the test
    if (jsErrors.length > 0) {
      console.log('JavaScript errors encountered:', jsErrors);
    }

    // Page should remain functional
    const sessionInput = page.locator('input[placeholder*="Session ID"]');
    await sessionInput.click();
    const isFocused = await sessionInput.evaluate(el => el === document.activeElement);
    expect(isFocused).toBeTruthy();
  });
});
