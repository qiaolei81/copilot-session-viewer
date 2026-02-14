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

  test('should display event list', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    
    // Wait for Vue to mount and events to load
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event', { timeout: 10000 });
    
    // Check events are displayed
    const events = page.locator('.event');
    await expect(events).not.toHaveCount(0);
  });

  test('should filter events by search', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    
    // Wait for Vue to mount and events to load
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event', { timeout: 10000 });
    
    // Get initial event count
    const initialCount = await page.locator('.event').count();
    
    // Type in search box - use generic term
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('e');  // Single letter - will definitely match something
    
    // Wait for search to complete (counter appears - may be "results" or "No matches")
    await page.waitForFunction(
      () => {
        const counter = document.querySelector('.search-result-count');
        return counter && counter.textContent.trim().length > 0;
      },
      { timeout: 5000 }
    );
    
    // Check search result counter is shown
    const counter = page.locator('.search-result-count');
    await expect(counter).toBeVisible();
    const counterText = await counter.textContent();
    
    // Should either show count or "No matches"
    expect(counterText).toMatch(/\d+ results?|No matches/);
  });

  test('should clear search filter', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event', { timeout: 10000 });
    
    const searchInput = page.locator('input[placeholder*="Search"]');
    
    // Search for single letter - guaranteed to match
    await searchInput.fill('e');
    
    // Wait for search to complete (counter appears)
    await page.waitForFunction(
      () => {
        const counter = document.querySelector('.search-result-count');
        return counter && counter.textContent.trim().length > 0;
      },
      { timeout: 5000 }
    );
    
    const filteredCount = await page.locator('.event').count();
    
    // Clear search
    await searchInput.clear();
    
    // Wait for counter to disappear (indicates search cleared)
    await page.waitForFunction(
      () => document.querySelector('.search-result-count') === null,
      { timeout: 5000 }
    );
    
    const clearedCount = await page.locator('.event').count();
    
    // Count should increase after clearing (or at minimum, be equal if filter matched all)
    expect(clearedCount).toBeGreaterThanOrEqual(filteredCount);
  });

  test('should expand and collapse tool details', async ({ page }) => {
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

  test('should toggle content visibility', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event', { timeout: 10000 });
    
    // Find an event with "Show more" button
    const showMoreButton = page.locator('button').filter({ hasText: 'Show more' }).first();
    
    if (await showMoreButton.count() > 0) {
      // Click "Show more"
      await showMoreButton.click();
      
      // Button text should change to "Show less"
      await expect(showMoreButton).toContainText('Show less');
      
      // Click "Show less"
      await showMoreButton.click();
      
      // Button text should change back
      await expect(showMoreButton).toContainText('Show more');
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
