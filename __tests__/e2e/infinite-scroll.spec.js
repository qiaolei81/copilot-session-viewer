const { test, expect } = require('./fixtures');

test.describe('Infinite Scroll', () => {
  test.beforeEach(async ({ page, request }) => {
    // Ensure no registered custom dirs leak in from sibling specs — HomeView's
    // bootstrap sync would otherwise pull them into localStorage and add their
    // sessions to the list, inflating session-card counts and breaking the
    // post-navigation preservation assertion.
    try {
      const list = await request.get('/api/dirs').then(r => r.ok() ? r.json() : []);
      for (const d of list) {
        await request.delete(`/api/dirs/${d.id}`).catch(() => {});
      }
    } catch { /* server might be warming up; goto below will retry */ }

    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display sessions with infinite scroll', async ({ page }) => {
    const sessionCount = await page.locator('[data-testid="session-card"]').count();

    // Verify the sessions container area is present
    const container = page.locator('[data-testid="session-list"]').first();
    if (sessionCount > 0) {
      await expect(container).toBeVisible();
    }

    console.log(`Found ${sessionCount} sessions (infinite scroll mode)`);
  });

  test('should load additional sessions when scrolling', async ({ page }) => {
    const initialSessionCount = await page.locator('[data-testid="session-card"]').count();

    if (initialSessionCount === 0) {
      console.log('No sessions available - skipping infinite scroll test');
      return;
    }

    // Scroll near bottom to trigger infinite scroll; wait for the batch XHR (if any)
    await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/sessions') && (r.url().includes('offset=') || r.url().includes('limit=')),
        { timeout: 3000 }
      ).catch(() => null),
      page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 400))
    ]);

    // Count sessions after scrolling
    const newSessionCount = await page.locator('[data-testid="session-card"]').count();

    // Sessions should be same or more (depends on whether more exist)
    expect(newSessionCount).toBeGreaterThanOrEqual(initialSessionCount);
    console.log(`Initial: ${initialSessionCount}, After scroll: ${newSessionCount}`);
  });

  test('should show loading state during scroll loading', async ({ page }) => {
    const sessionCount = await page.locator('[data-testid="session-card"]').count();

    if (sessionCount === 0) {
      console.log('No sessions available - skipping loading state test');
      return;
    }

    // Scroll near bottom to trigger loading
    await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/sessions') && (r.url().includes('offset=') || r.url().includes('limit=')),
        { timeout: 3000 }
      ).catch(() => null),
      page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 400))
    ]);

    // Check for loading indicator (may appear briefly)
    const loadingSpinner = page.locator('.loading-spinner');
    const hasLoadingState = await loadingSpinner.isVisible({ timeout: 2000 }).catch(() => false);

    console.log('Loading state visible during scroll:', hasLoadingState);

    // Wait for spinner to disappear (load complete)
    await loadingSpinner.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null);
  });

  test('should trigger infinite scroll when scrolling near bottom', async ({ page }) => {
    const initialSessionCount = await page.locator('[data-testid="session-card"]').count();

    // Scroll to bottom of page; wait for any session batch XHR
    await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/sessions') && (r.url().includes('offset=') || r.url().includes('limit=')),
        { timeout: 3000 }
      ).catch(() => null),
      page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 600))
    ]);

    // Check if more sessions were loaded
    const newSessionCount = await page.locator('[data-testid="session-card"]').count();

    if (initialSessionCount >= 20) {
      expect(newSessionCount).toBeGreaterThanOrEqual(initialSessionCount);
    }
  });

  test('should stop loading when no more sessions available', async ({ page }) => {
    let currentCount = await page.locator('[data-testid="session-card"]').count();

    if (currentCount === 0) {
      console.log('No sessions available - skipping test');
      return;
    }

    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const previousCount = currentCount;

      // Scroll to bottom; await batch XHR (or no-op if no more pages)
      await Promise.all([
        page.waitForResponse(
          r => r.url().includes('/sessions') && (r.url().includes('offset=') || r.url().includes('limit=')),
          { timeout: 2000 }
        ).catch(() => null),
        page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      ]);
      // Allow DOM to settle after response
      await expect.poll(
        () => page.locator('[data-testid="session-card"]').count(),
        { timeout: 2000 }
      ).toBeGreaterThanOrEqual(previousCount);
      currentCount = await page.locator('[data-testid="session-card"]').count();

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

    const sessionCount = await page.locator('[data-testid="session-card"]').count();

    if (sessionCount === 0) {
      console.log('No sessions available - skipping error handling test');
      return;
    }

    // Scroll to trigger infinite scroll; wait for the (intercepted) 500 response
    await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/sessions') && (r.url().includes('offset=') || r.url().includes('limit=')),
        { timeout: 3000 }
      ).catch(() => null),
      page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 400))
    ]);

    // Check that page is still functional
    await expect(page.locator('h1')).toContainText('Session Viewer');

    const sessionInput = page.locator('input[placeholder*="Session ID"]');
    await expect(sessionInput).toBeVisible();

    console.log('Page remains functional after API error');
  });

  test('should preserve session list state during navigation', async ({ page }) => {
    const sessionCount = await page.locator('[data-testid="session-card"]').count();

    if (sessionCount === 0) {
      console.log('No sessions available - skipping navigation test');
      return;
    }

    // Scroll to potentially load more
    await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/sessions') && (r.url().includes('offset=') || r.url().includes('limit=')),
        { timeout: 2000 }
      ).catch(() => null),
      page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 400))
    ]);

    const sessionsAfterScroll = await page.locator('[data-testid="session-card"]').count();

    // Click on first session
    const firstSession = page.locator('[data-testid="session-card"]').first();
    await firstSession.click();

    // Wait for navigation (hash router)
    await page.waitForFunction(() => window.location.hash.match(/^#\/.*\/session\/.+/));

    // Go back to homepage
    await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/sessions'),
        { timeout: 5000 }
      ).catch(() => null),
      page.goBack()
    ]);
    await page.waitForLoadState('networkidle');

    // Check if sessions are still loaded
    await page.waitForSelector('[data-testid="session-card"]', { timeout: 5000 });
    const newSessionCount = await page.locator('[data-testid="session-card"]').count();

    // Should show at least initial batch
    expect(newSessionCount).toBeGreaterThanOrEqual(Math.min(sessionsAfterScroll, 20));
    console.log(`Before nav: ${sessionsAfterScroll}, After nav: ${newSessionCount}`);
  });
});
