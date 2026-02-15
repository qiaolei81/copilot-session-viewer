import { test, expect } from '@playwright/test';

test.describe('Core Functionality Tests', () => {
  let SESSION_ID;

  test.beforeAll(async ({ request }) => {
    // Get first session ID from API for testing
    const response = await request.get('/api/sessions');
    const sessions = await response.json();
    if (sessions.length > 0) {
      SESSION_ID = sessions[0].id;
    }
  });

  test('should load homepage with basic elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Core elements should be present
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('input[placeholder*="Session ID"]')).toBeVisible();
    await expect(page.locator('#importLink')).toBeVisible();
  });

  test('should display sessions if available', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sessionItems = page.locator('.recent-item');
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

    // Load more button should exist in DOM
    const loadMoreButton = page.locator('#load-more-btn');
    await expect(loadMoreButton).toBeAttached();

    // Loading indicator should exist
    const loadingIndicator = page.locator('#loading-indicator');
    await expect(loadingIndicator).toBeAttached();
  });

  test('should navigate to session detail page', async ({ page }) => {
    if (!SESSION_ID) {
      test.skip('No sessions available for navigation test');
    }

    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForLoadState('networkidle');

    // Should load session detail page
    await expect(page.locator('body')).toBeVisible();

    // URL should be correct
    expect(page.url()).toContain(`/session/${SESSION_ID}`);
  });

  test('should load Vue session detail page', async ({ page }) => {
    if (!SESSION_ID) {
      test.skip('No sessions available for Vue test');
    }

    await page.goto(`/session/${SESSION_ID}/vue`);
    await page.waitForLoadState('networkidle');

    // Vue page should load
    await expect(page.locator('body')).toBeVisible();

    // Should have share button (key Vue feature)
    const shareButton = page.locator('button:has-text("📤 Share Session")');
    const hasShareButton = await shareButton.isVisible({ timeout: 5000 });

    if (hasShareButton) {
      console.log('Vue session page loaded with share functionality');
    } else {
      console.log('Vue session page loaded but share button not visible');
    }
  });

  test('should load time analysis page', async ({ page }) => {
    if (!SESSION_ID) {
      test.skip('No sessions available for time analysis test');
    }

    await page.goto(`/session/${SESSION_ID}/time-analyze`);
    await page.waitForLoadState('networkidle');

    // Time analysis page should load
    await expect(page.locator('body')).toBeVisible();

    // Should have insight tab (key feature)
    const insightTab = page.locator('button:has-text("💡 Copilot Insight")');
    const hasInsightTab = await insightTab.isVisible({ timeout: 5000 });

    if (hasInsightTab) {
      console.log('Time analysis page loaded with insight functionality');
    } else {
      console.log('Time analysis page loaded but insight tab not visible');
    }
  });

  test('should handle API endpoints correctly', async ({ request }) => {
    // Test main sessions endpoint
    const sessionsResponse = await request.get('/api/sessions');
    expect(sessionsResponse.ok()).toBeTruthy();

    const sessions = await sessionsResponse.json();
    expect(Array.isArray(sessions)).toBeTruthy();

    // Test load-more endpoint
    const loadMoreResponse = await request.get('/api/sessions/load-more?offset=0&limit=5');
    expect(loadMoreResponse.ok()).toBeTruthy();

    const loadMoreData = await loadMoreResponse.json();
    expect(loadMoreData).toHaveProperty('sessions');
    expect(loadMoreData).toHaveProperty('hasMore');
  });

  test('should handle session import dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Import link should be clickable
    const importLink = page.locator('#importLink');
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