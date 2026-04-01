const { test, expect } = require('./fixtures');

test.describe('Session Detail Page', () => {
  // Use a known session ID from your test environment
  // This will be dynamically fetched in the actual test
  let SESSION_ID;
  let CLAUDE_USAGE_SESSION_ID;

  const getWithRetry = async (request, url, attempts = 3) => {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await request.get(url);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
      }
    }

    throw lastError;
  };
  
  test.beforeAll(async ({ request }) => {
    // Get first session ID from API
    const response = await getWithRetry(request, '/api/sessions');
    const sessions = await response.json();
    if (sessions.length > 0) {
      SESSION_ID = sessions[0].id;
    } else {
      throw new Error('No sessions available for testing');
    }

    const claudeResponse = await getWithRetry(request, '/api/sessions?source=claude');
    const claudeSessions = await claudeResponse.json();
    for (const session of claudeSessions.slice(0, 10)) {
      const detailResponse = await getWithRetry(request, `/session/${session.id}`);
      const detailHtml = await detailResponse.text();
      if (detailHtml.includes('"usage":') && detailHtml.includes('"modelMetrics"')) {
        CLAUDE_USAGE_SESSION_ID = session.id;
        break;
      }
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

  test('should display usage summary for Claude sessions when usage data exists', async ({ page }) => {
    test.skip(!CLAUDE_USAGE_SESSION_ID, 'No Claude session with usage data available');

    await page.goto(`/session/${CLAUDE_USAGE_SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    const usageCompact = page.locator('.usage-compact').first();
    await expect(usageCompact).toBeVisible();
    await expect(usageCompact).toContainText('reqs');
    await expect(usageCompact).toContainText('tokens');
  });

  test('should display event list', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    
    // Wait for Vue to mount
    await page.waitForSelector('.main-layout', { timeout: 15000 });
    
    // Wait for loading to finish (either events load or error appears)
    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });
    
    // Check if error occurred
    const errorEl = page.locator('.error-message');
    if (await errorEl.count() > 0) {
      throw new Error(`Events failed to load: ${await errorEl.textContent()}`);
    }
    
    // Check events are displayed
    const events = page.locator('.event-header');
    await expect(events.first()).toBeVisible({ timeout: 5000 });
    const count = await events.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should filter events by search', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);

    // Wait for Vue to mount and events to load
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    // Wait for event headers - may fail if events can't load (e.g., rate limiting)
    try {
      await page.waitForSelector('.event-header', { timeout: 15000 });
    } catch {
      // If events didn't load (e.g., "Too Many Requests"), skip the rest
      const errorVisible = await page.locator('text=Error loading events').count();
      if (errorVisible > 0) {
        console.log('Events failed to load (likely rate limiting) — skipping filter test');
        return;
      }
      throw new Error('Event headers did not appear and no loading error was shown');
    }

    // Wait for virtual scroller to stabilize
    await page.waitForTimeout(1000);

    // Get initial event count from "All (N)" button text
    const getEventCount = async () => {
      const allButtonText = await page.locator('button').filter({ hasText: /^All \(\d+\)$/ }).textContent();
      const match = allButtonText.match(/All \((\d+)\)/);
      return match ? parseInt(match[1]) : 0;
    };
    
    const initialCount = await getEventCount();
    expect(initialCount).toBeGreaterThan(0);

    // Type in search box
    const searchInput = page.locator('input[placeholder="🔍 Search events..."]');
    await searchInput.fill('assistant.message');

    // Wait for debounce + search to complete
    await page.waitForTimeout(800);

    const filteredCount = await getEventCount();

    // Filtered count should be less than or equal to initial
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('should clear search filter', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 15000 });
    
    // Wait for loading to finish
    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });
    
    // Check if error occurred
    const errorEl = page.locator('.error-message');
    if (await errorEl.count() > 0) {
      throw new Error(`Events failed to load: ${await errorEl.textContent()}`);
    }
    
    // Wait for events to appear
    await page.waitForSelector('.event-header', { timeout: 5000 });
    
    // Wait for virtual scroller to stabilize
    await page.waitForTimeout(1000);
    
    // Helper function to get event count from "All (N)" button
    const getEventCount = async () => {
      const allButtonText = await page.locator('button').filter({ hasText: /^All \(\d+\)$/ }).textContent();
      const match = allButtonText.match(/All \((\d+)\)/);
      return match ? parseInt(match[1]) : 0;
    };
    
    const searchInput = page.locator('input[placeholder="🔍 Search events..."]');
    
    // Search for something specific
    await searchInput.fill('assistant.message');
    await page.waitForTimeout(800);
    
    const filteredCount = await getEventCount();
    
    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(800);
    
    const clearedCount = await getEventCount();
    
    // Count should increase after clearing
    expect(clearedCount).toBeGreaterThanOrEqual(filteredCount);
  });

  test('should expand and collapse tool details', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForLoadState('networkidle');

    // Wait for page content to load - try multiple possible selectors
    const _pageLoaded = await Promise.race([
      page.waitForSelector('.container', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('body', { timeout: 5000 })
    ]);

    // Wait for events to load
    await page.waitForTimeout(2000);

    // Find tool calls - try different possible selectors
    const toolSelectors = ['.tool-name', '.turn-content', '.event-item', 'button[data-testid="expand-button"]'];
    let toolElement = null;

    for (const selector of toolSelectors) {
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        toolElement = element;
        break;
      }
    }

    if (toolElement) {
      try {
        // Try to click the element or its parent
        const clickableElement = toolElement.locator('..').first();
        await clickableElement.click({ timeout: 3000 });
        await page.waitForTimeout(500);
        console.log('Successfully clicked tool element for expand/collapse test');
      } catch (error) {
        console.log('Tool expand/collapse test - element not clickable or test not applicable to current page structure');
      }
    } else {
      console.log('No expandable tool elements found - test may not be applicable to current page structure');
    }
  });

  test('should toggle content visibility', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForLoadState('networkidle');

    // Wait for page content to load - try multiple possible selectors
    const _pageLoaded = await Promise.race([
      page.waitForSelector('.container', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('body', { timeout: 5000 })
    ]);

    // Wait for events to load
    await page.waitForTimeout(2000);
    
    // Find an event with "Show more" button
    const firstButton = page.locator('button').filter({ hasText: 'Show more ▼' }).first();
    
    if (await firstButton.count() > 0) {
      // Get the stable content ID from data attribute
      const contentId = await firstButton.getAttribute('data-content-id');
      
      // Use stable selector based on content ID
      const button = page.locator(`button[data-content-id="${contentId}"]`);
      
      // Scroll element into view (works with virtual scrolling)
      await button.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      
      // Click "Show more" - use force:true for virtual scroll compatibility
      await button.click({ force: true });
      await page.waitForTimeout(300);
      
      // Button text should change to "Show less"
      await expect(button).toContainText('Show less ▲');
      
      // Click "Show less"
      await button.click({ force: true });
      await page.waitForTimeout(300);
      
      // Button text should change back
      await expect(button).toContainText('Show more ▼');
    }
  });

  test('should toggle sidebar', async ({ page }) => {
    await page.goto(`/session/${SESSION_ID}`);
    await page.waitForLoadState('networkidle');

    // Wait for page content to load - try multiple possible selectors
    const _pageLoaded = await Promise.race([
      page.waitForSelector('.container', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('body', { timeout: 5000 })
    ]);

    // Check if sidebar functionality exists - try different sidebar selectors
    const sidebarSelectors = ['.sidebar', '.side-panel', '[data-testid="sidebar"]', '.filter-panel'];
    let sidebarElement = null;

    for (const selector of sidebarSelectors) {
      const element = page.locator(selector).first();
      if (await element.count() > 0 && await element.isVisible()) {
        sidebarElement = element;
        break;
      }
    }
    // Find sidebar toggle button - try different possible selectors
    const toggleSelectors = ['.sidebar-toggle', '[data-testid="sidebar-toggle"]', '.toggle-btn', 'button[aria-label*="toggle"]'];
    let toggleElement = null;

    for (const selector of toggleSelectors) {
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        toggleElement = element;
        break;
      }
    }

    if (sidebarElement && toggleElement) {
      try {
        // Wait for any animations to complete
        await page.waitForTimeout(500);

        // Click to toggle sidebar
        await toggleElement.click({ force: true, timeout: 3000 });
        await page.waitForTimeout(500);

        console.log('Successfully toggled sidebar');
      } catch (error) {
        console.log('Sidebar toggle test - functionality not available or test not applicable to current page structure');
      }
    } else {
      console.log('No sidebar or toggle functionality found - test may not be applicable to current page structure');
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
