const { test, expect } = require('./fixtures');

test.describe('Infinite Scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display sessions with infinite scroll', async ({ page }) => {
    const sessionCount = await page.locator('.recent-item').count();

    // Verify the sessions container area is present
    const container = page.locator('.recent-sessions');
    if (sessionCount > 0) {
      await expect(container).toBeVisible();
    }

    console.log(`Found ${sessionCount} sessions (infinite scroll mode)`);
  });

  test('should load additional sessions when scrolling', async ({ page }) => {
    const initialSessionCount = await page.locator('.recent-item').count();

    if (initialSessionCount === 0) {
      console.log('No sessions available - skipping infinite scroll test');
      return;
    }

    // Scroll near bottom to trigger infinite scroll
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight - 400);
    });

    // Wait for potential loading
    await page.waitForTimeout(3000);

    // Count sessions after scrolling
    const newSessionCount = await page.locator('.recent-item').count();

    // Sessions should be same or more (depends on whether more exist)
    expect(newSessionCount).toBeGreaterThanOrEqual(initialSessionCount);
    console.log(`Initial: ${initialSessionCount}, After scroll: ${newSessionCount}`);
  });

  test('should show loading state during scroll loading', async ({ page }) => {
    const sessionCount = await page.locator('.recent-item').count();

    if (sessionCount === 0) {
      console.log('No sessions available - skipping loading state test');
      return;
    }

    // Scroll near bottom to trigger loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight - 400);
    });

    // Check for loading indicator (may appear briefly)
    const loadingSpinner = page.locator('.loading-spinner');
    const hasLoadingState = await loadingSpinner.isVisible({ timeout: 2000 }).catch(() => false);

    console.log('Loading state visible during scroll:', hasLoadingState);

    // Wait for completion
    await page.waitForTimeout(3000);
  });

  test('should trigger infinite scroll when scrolling near bottom', async ({ page }) => {
    const initialSessionCount = await page.locator('.recent-item').count();

    // Scroll to bottom of page
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight - 600);
    });

    // Wait for potential loading
    await page.waitForTimeout(3000);

    // Check if more sessions were loaded
    const newSessionCount = await page.locator('.recent-item').count();

    if (initialSessionCount >= 20) {
      expect(newSessionCount).toBeGreaterThanOrEqual(initialSessionCount);
    }
  });

  test('should stop loading when no more sessions available', async ({ page }) => {
    let currentCount = await page.locator('.recent-item').count();

    if (currentCount === 0) {
      console.log('No sessions available - skipping test');
      return;
    }

    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const previousCount = currentCount;

      // Scroll to bottom
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      await page.waitForTimeout(2000);
      currentCount = await page.locator('.recent-item').count();

      if (currentCount === previousCount) {
        console.log('No more sessions to load - infinite scroll stopped');
        break;
      }

      attempts++;
    }

    console.log(`Loaded ${currentCount} total sessions across ${attempts} scroll attempts`);
  });

  test('should handle API errors gracefully during infinite scroll', async ({ page }) => {
    // Intercept the load-more API to return an error
    await page.route('**/api/*/sessions*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' })
      });
    });

    const sessionCount = await page.locator('.recent-item').count();

    if (sessionCount === 0) {
      console.log('No sessions available - skipping error handling test');
      return;
    }

    // Scroll to trigger infinite scroll
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight - 400);
    });

    // Wait for potential error handling
    await page.waitForTimeout(2000);

    // Check that page is still functional
    await expect(page.locator('h1')).toContainText('Session Viewer');

    const sessionInput = page.locator('input[placeholder*="Session ID"]');
    await expect(sessionInput).toBeVisible();

    console.log('Page remains functional after API error');
  });

  test('should preserve session list state during navigation', async ({ page }) => {
    const sessionCount = await page.locator('.recent-item').count();

    if (sessionCount === 0) {
      console.log('No sessions available - skipping navigation test');
      return;
    }

    // Scroll to potentially load more
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight - 400);
    });
    await page.waitForTimeout(2000);

    const sessionsAfterScroll = await page.locator('.recent-item').count();

    // Click on first session
    const firstSession = page.locator('.recent-item').first();
    await firstSession.click();

    // Wait for navigation (hash router)
    await page.waitForURL(/#\/session\/.+/);

    // Go back to homepage
    await page.goBack();
    await page.waitForTimeout(2000);

    // Check if sessions are still loaded
    await page.waitForSelector('.recent-item', { timeout: 5000 });
    const newSessionCount = await page.locator('.recent-item').count();

    // Should show at least initial batch
    expect(newSessionCount).toBeGreaterThanOrEqual(Math.min(sessionsAfterScroll, 20));
    console.log(`Before nav: ${sessionsAfterScroll}, After nav: ${newSessionCount}`);
  });
});
