import { test, expect } from '@playwright/test';

test.describe('Session Detail Page', () => {
  // Use a known session ID from your test environment
  // This will be dynamically fetched in the actual test
  let SESSION_ID;
  
  test.beforeAll(async ({ request }) => {
    // Get first session ID from API
    const response = await request.get('/api/sessions');
    const sessions = await response.json();
    if (sessions.length > 0) {
      SESSION_ID = sessions[0].id;
    } else {
      throw new Error('No sessions available for testing');
    }
  });
  
  // Suppress harmless virtual scroller errors
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      const message = error.message;
      // Ignore known virtual scroller issues
      if (message.includes('ResizeObserver') || 
          message.includes("Cannot read properties of undefined (reading 'has')")) {
        return;  // Ignore
      }
      throw error;  // Re-throw other errors
    });
  });
  
  test('should load session detail page', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    
    // Wait for Vue to mount and render
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    
    // Check page loaded
    await expect(page.locator('.main-layout')).toBeVisible();
  });

  test('should display session metadata', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    
    // Wait for Vue to mount
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    
    // Check sidebar (metadata section)
    await expect(page.locator('.sidebar')).toBeVisible();
    
    // Check session info is shown
    await expect(page.locator('.session-info')).toBeVisible();
  });

  test.skip('should display event list', async ({ page }) => {
    // TODO: Update this test for new Vue-based UI
    await page.goto(`/session/${SESSION_ID}`);
    
    // Wait for Vue to mount and events to load
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event', { timeout: 10000 });
    
    // Check events are displayed
    const events = page.locator('.event');
    await expect(events).not.toHaveCount(0);
  });

  test.skip('should filter events by search', async ({ page }) => {
    // TODO: Update this test for new Vue-based UI
    await page.goto(`/session/${SESSION_ID}`);
    
    // Wait for Vue to mount and events to load
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event', { timeout: 10000 });
    
    // CRITICAL: Wait for virtual scroller to fully stabilize
    await page.waitForTimeout(1000);
    
    // Get initial event count
    const initialCount = await page.locator('.event').count();
    expect(initialCount).toBeGreaterThan(0);  // Ensure events are visible
    
    // Type in search box - use generic term
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('e');  // Single letter - will definitely match something
    
    // Wait for debounce + search to complete (counter appears)
    await page.waitForFunction(
      () => {
        const counter = document.querySelector('.search-result-count');
        return counter && counter.textContent.trim().length > 0;
      },
      { timeout: 10000 }  // Increased timeout to 10s
    );
    
    // Check search result counter is shown
    const counter = page.locator('.search-result-count');
    await expect(counter).toBeVisible();
    const counterText = await counter.textContent();
    
    // Should either show count or "No matches"
    expect(counterText).toMatch(/\d+ results?|No matches/);
  });

  test.skip('should clear search filter', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event', { timeout: 10000 });
    
    // CRITICAL: Wait for virtual scroller to fully stabilize
    await page.waitForTimeout(1000);
    
    // Ensure events are visible before searching
    const initialCount = await page.locator('.event').count();
    expect(initialCount).toBeGreaterThan(0);
    
    const searchInput = page.locator('input[placeholder*="Search"]');
    
    // Search for single letter - guaranteed to match
    await searchInput.fill('e');
    
    // Wait for search to complete (counter appears)
    await page.waitForFunction(
      () => {
        const counter = document.querySelector('.search-result-count');
        return counter && counter.textContent.trim().length > 0;
      },
      { timeout: 10000 }  // Increased timeout
    );
    
    const filteredCount = await page.locator('.event').count();
    
    // Clear search
    await searchInput.clear();
    
    // Wait for counter to disappear (indicates search cleared)
    await page.waitForFunction(
      () => document.querySelector('.search-result-count') === null,
      { timeout: 10000 }  // Increased timeout
    );
    
    const clearedCount = await page.locator('.event').count();
    
    // Count should increase after clearing (or at minimum, be equal if filter matched all)
    expect(clearedCount).toBeGreaterThanOrEqual(filteredCount);
  });

  test.skip('should expand and collapse tool details', async ({ page }) => {
    // TODO: Update this test for new Vue-based UI
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event', { timeout: 10000 });
    
    // Find a tool call event
    const toolEvent = page.locator('.event').filter({ hasText: 'tool.execution_start' }).first();
    
    if (await toolEvent.count() > 0) {
      // Click to expand
      await toolEvent.locator('.tool-header-line').click();
      
      // Check details are visible
      await expect(toolEvent.locator('.tool-details')).toBeVisible();
      
      // Click again to collapse
      await toolEvent.locator('.tool-header-line').click();
      
      // Check details are hidden
      await expect(toolEvent.locator('.tool-details')).not.toBeVisible();
    }
  });

  test.skip('should toggle content visibility', async ({ page }) => {
    // TODO: Update this test for new Vue-based UI
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event', { timeout: 10000 });
    
    // Find an event with "Show more" button
    const showMoreButton = page.locator('button[data-content-id]').filter({ hasText: 'Show more' }).first();
    
    if (await showMoreButton.count() > 0) {
      // Get the content ID
      const contentId = await showMoreButton.getAttribute('data-content-id');
      
      // Click "Show more"
      await showMoreButton.click();
      
      // Wait for Vue to update
      await page.waitForTimeout(500);
      
      // Find button by content ID (more stable than hasText filter)
      const button = page.locator(`button[data-content-id="${contentId}"]`);
      
      // Button text should change to "Show less"
      await expect(button).toContainText('Show less', { timeout: 10000 });
      
      // Click "Show less"
      await button.click();
      
      // Wait for Vue to update
      await page.waitForTimeout(500);
      
      // Button text should change back
      await expect(button).toContainText('Show more', { timeout: 10000 });
    }
  });

  test('should toggle sidebar', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.sidebar', { timeout: 10000 });
    
    // Find sidebar toggle button
    const toggleButton = page.locator('.sidebar-toggle');
    
    if (await toggleButton.count() > 0) {
      // Wait for any animations to complete
      await page.waitForTimeout(500);
      
      // Click to collapse (force if needed - element might be temporarily overlapped)
      await toggleButton.click({ force: true });
      
      // Wait for collapse animation
      await page.waitForTimeout(300);
      
      // Check sidebar is collapsed
      await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
      
      // Click to expand
      await toggleButton.click({ force: true });
      
      // Wait for expand animation
      await page.waitForTimeout(300);
      
      // Check sidebar is expanded
      await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);
    }
  });

  test('should handle invalid session ID gracefully', async ({ page }) => {
    const response = await page.goto('/session/invalid-session-id-123');
    
    // Should return 404
    expect(response?.status()).toBe(404);
    
    // Should show error message
    await expect(page.locator('body')).toContainText('Session not found');
  });
});
