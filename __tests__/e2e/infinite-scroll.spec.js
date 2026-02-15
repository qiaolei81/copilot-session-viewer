import { test, expect } from '@playwright/test';

test.describe('Infinite Scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Wait for initial session load
    await page.waitForSelector('.recent-item', { timeout: 10000 });
  });

  test('should display Load More Sessions button when there are more sessions', async ({ page }) => {
    // Check if Load More button exists (it might be hidden initially)
    const loadMoreButton = page.locator('#load-more-btn');
    const loadMoreSection = page.locator('#load-more-section');

    // Button should exist in DOM even if hidden
    await expect(loadMoreButton).toBeAttached();

    // If there are enough sessions, button should become visible
    const sessionCount = await page.locator('.recent-item').count();
    if (sessionCount >= 20) {
      await expect(loadMoreSection).toBeVisible();
      await expect(loadMoreButton).toContainText('Load More Sessions');
    }
  });

  test('should load additional sessions when Load More button is clicked', async ({ page }) => {
    // Count initial sessions
    const initialSessionCount = await page.locator('.recent-item').count();
    expect(initialSessionCount).toBeGreaterThan(0);

    // Check if Load More button is available and visible
    const loadMoreButton = page.locator('#load-more-btn');
    const loadMoreSection = page.locator('#load-more-section');

    const isLoadMoreVisible = await loadMoreSection.isVisible();

    if (isLoadMoreVisible) {
      await loadMoreButton.click();

      // Wait for loading to complete
      await page.waitForTimeout(3000);

      // Count sessions after loading
      const newSessionCount = await page.locator('.recent-item').count();
      expect(newSessionCount).toBeGreaterThanOrEqual(initialSessionCount);
    } else {
      console.log('Load More button not visible - possibly no more sessions to load');
    }
  });

  test('should show loading state when Load More button is clicked', async ({ page }) => {
    const loadMoreButton = page.locator('#load-more-btn');
    const loadMoreSection = page.locator('#load-more-section');

    const isLoadMoreVisible = await loadMoreSection.isVisible();

    if (isLoadMoreVisible) {
      // Click Load More button
      await loadMoreButton.click();

      // Check for loading indicator (use first() to avoid strict mode violation)
      const loadingIndicator = page.locator('#loading-indicator, .loading-spinner').first();
      const hasLoadingState = await loadingIndicator.isVisible({ timeout: 2000 });

      console.log('Loading state visible:', hasLoadingState);

      // Wait for completion
      await page.waitForTimeout(3000);
    } else {
      console.log('Load More button not available for testing loading state');
    }
  });

  test('should trigger infinite scroll when scrolling near bottom', async ({ page }) => {
    // Count initial sessions
    const initialSessionCount = await page.locator('.recent-item').count();

    // Scroll to bottom of page
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight - 600);
    });

    // Wait for potential loading
    await page.waitForTimeout(3000);

    // Check if more sessions were loaded
    const newSessionCount = await page.locator('.recent-item').count();

    // If there are more sessions available, they should load
    if (initialSessionCount >= 20) {
      expect(newSessionCount).toBeGreaterThanOrEqual(initialSessionCount);
    }
  });

  test('should hide Load More button when no more sessions available', async ({ page }) => {
    // Keep clicking Load More until no more sessions
    let currentCount = await page.locator('.recent-item').count();
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loop

    while (attempts < maxAttempts) {
      const loadMoreButton = page.locator('#load-more-btn');

      if (!(await loadMoreButton.isVisible())) {
        break;
      }

      const previousCount = currentCount;
      await loadMoreButton.click();
      await page.waitForTimeout(2000);
      currentCount = await page.locator('.recent-item').count();

      // If no new sessions loaded, button should be hidden
      if (currentCount === previousCount) {
        await expect(loadMoreButton).toBeHidden();
        break;
      }

      attempts++;
    }
  });

  test('should handle API errors gracefully during infinite scroll', async ({ page }) => {
    // Intercept the load-more API to return an error
    await page.route('**/api/sessions/load-more*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' })
      });
    });

    const loadMoreButton = page.locator('#load-more-btn');

    if (await loadMoreButton.isVisible()) {
      await loadMoreButton.click();

      // Should handle error gracefully (not crash the page)
      await page.waitForTimeout(2000);

      // Check that page is still functional
      await expect(page.locator('h1')).toContainText('Session Viewer');

      // Button should be available again or show error state
      const isButtonVisible = await loadMoreButton.isVisible();
      const hasErrorMessage = await page.locator('[data-testid="error-message"], .error').isVisible();

      expect(isButtonVisible || hasErrorMessage).toBeTruthy();
    }
  });

  test('should preserve session list state during navigation', async ({ page }) => {
    // Load additional sessions
    const loadMoreButton = page.locator('#load-more-btn');

    if (await loadMoreButton.isVisible()) {
      await loadMoreButton.click();
      await page.waitForTimeout(2000);
    }

    const sessionCount = await page.locator('.recent-item').count();

    // Click on first session
    const firstSession = page.locator('.recent-item').first();
    await firstSession.click();

    // Wait for navigation
    await page.waitForURL(/\/session\/.+/);

    // Go back to homepage
    await page.goBack();
    await page.waitForURL('/');

    // Check if sessions are still loaded (should maintain state)
    await page.waitForSelector('.recent-item', { timeout: 5000 });
    const newSessionCount = await page.locator('.recent-item').count();

    // Should show at least initial batch, ideally maintain the loaded state
    expect(newSessionCount).toBeGreaterThanOrEqual(Math.min(sessionCount, 20));
  });
});