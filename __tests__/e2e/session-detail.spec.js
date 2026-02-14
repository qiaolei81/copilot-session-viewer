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
  
  test('should load session detail page', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    
    // Check page loaded
    await expect(page.locator('.session-container')).toBeVisible();
  });

  test('should display session metadata', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    
    // Check metadata section
    await expect(page.locator('.metadata-section')).toBeVisible();
    
    // Check session summary is shown
    await expect(page.locator('.session-header h2')).toBeVisible();
  });

  test('should display event list', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    
    // Wait for events to load
    await page.waitForSelector('.event-item', { timeout: 5000 });
    
    // Check events are displayed
    const events = page.locator('.event-item');
    await expect(events).not.toHaveCount(0);
  });

  test('should filter events by search', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.event-item');
    
    // Get initial event count
    const initialCount = await page.locator('.event-item').count();
    
    // Type in search box
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('github');
    
    // Wait for debounce (300ms)
    await page.waitForTimeout(400);
    
    // Check event count changed
    const filteredCount = await page.locator('.event-item').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    
    // Check search result counter is shown
    await expect(page.locator('.search-result-count')).toBeVisible();
  });

  test('should clear search filter', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.event-item');
    
    const searchInput = page.locator('input[placeholder*="Search"]');
    
    // Search
    await searchInput.fill('github');
    await page.waitForTimeout(400);
    const filteredCount = await page.locator('.event-item').count();
    
    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(400);
    const clearedCount = await page.locator('.event-item').count();
    
    // Count should increase after clearing
    expect(clearedCount).toBeGreaterThan(filteredCount);
  });

  test('should expand and collapse tool details', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.event-item');
    
    // Find a tool call event
    const toolEvent = page.locator('.event-item').filter({ hasText: 'tool.execution_start' }).first();
    
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
    await page.waitForSelector('.event-item');
    
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
    await page.waitForSelector('.metadata-section');
    
    // Find sidebar toggle button
    const toggleButton = page.locator('.sidebar-toggle');
    
    if (await toggleButton.count() > 0) {
      // Click to collapse
      await toggleButton.click();
      
      // Check sidebar is collapsed
      await expect(page.locator('.metadata-section')).toHaveClass(/collapsed/);
      
      // Click to expand
      await toggleButton.click();
      
      // Check sidebar is expanded
      await expect(page.locator('.metadata-section')).not.toHaveClass(/collapsed/);
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
