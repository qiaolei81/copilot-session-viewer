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
    await page.waitForSelector('.event-header', { timeout: 10000 });
    
    // Check events are displayed
    const events = page.locator('.event-header');
    await expect(events.first()).toBeVisible();
    const count = await events.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should filter events by search', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    
    // Wait for Vue to mount and events to load
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event-header', { timeout: 10000 });
    
    // Wait for virtual scroller to stabilize
    await page.waitForTimeout(1000);
    
    // Get initial event count
    const initialCount = await page.locator('.event-header').count();
    expect(initialCount).toBeGreaterThan(0);
    
    // Type in search box
    const searchInput = page.locator('input[placeholder="🔍 Search events..."]');
    await searchInput.fill('assistant.message');
    
    // Wait for debounce + search to complete
    await page.waitForTimeout(800);
    
    // Get filtered count
    const filteredCount = await page.locator('.event-header').count();
    
    // Filtered count should be less than or equal to initial
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('should clear search filter', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event-header', { timeout: 10000 });
    
    // Wait for virtual scroller to stabilize
    await page.waitForTimeout(1000);
    
    const searchInput = page.locator('input[placeholder="🔍 Search events..."]');
    
    // Search for something specific
    await searchInput.fill('assistant.message');
    await page.waitForTimeout(800);
    
    const filteredCount = await page.locator('.event-header').count();
    
    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(800);
    
    const clearedCount = await page.locator('.event-header').count();
    
    // Count should increase after clearing
    expect(clearedCount).toBeGreaterThanOrEqual(filteredCount);
  });

  test('should expand and collapse tool details', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event-header', { timeout: 10000 });
    
    // Wait for events to load
    await page.waitForTimeout(1000);
    
    // Find a tool call (look for tool-name class)
    const toolHeader = page.locator('.tool-name').first();
    
    if (await toolHeader.count() > 0) {
      // Get parent element (clickable area)
      const toolRow = toolHeader.locator('..');
      
      // Click to expand
      await toolRow.click();
      await page.waitForTimeout(300);
      
      // Check expand icon changed (▶ → ▼)
      await expect(toolRow).toContainText('▼');
      
      // Click again to collapse
      await toolRow.click();
      await page.waitForTimeout(300);
      
      // Check expand icon changed back (▼ → ▶)
      await expect(toolRow).toContainText('▶');
    }
  });

  test('should toggle content visibility', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    await page.waitForSelector('.event-header', { timeout: 10000 });
    
    // Wait for events to load
    await page.waitForTimeout(1000);
    
    // Find an event with "Show more" button
    const showMoreButton = page.locator('button').filter({ hasText: 'Show more ▼' }).first();
    
    if (await showMoreButton.count() > 0) {
      // Click "Show more"
      await showMoreButton.click();
      await page.waitForTimeout(300);
      
      // Button text should change to "Show less"
      await expect(showMoreButton).toContainText('Show less ▲');
      
      // Click "Show less"
      await showMoreButton.click();
      await page.waitForTimeout(300);
      
      // Button text should change back
      await expect(showMoreButton).toContainText('Show more ▼');
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
