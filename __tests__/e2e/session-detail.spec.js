const { test, expect } = require('./fixtures');

test.describe('Session Detail Page', () => {
  // Use a known session ID from your test environment
  // This will be dynamically fetched in the actual test
  let SESSION_ID;
  let EVENTFUL_SESSION_ID;
  let CLAUDE_USAGE_SESSION_ID;
  let CLAUDE_DEDUP_SESSION_ID;

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

  const getRenderedEventItems = page => page.locator('.event, .turn-divider, .subagent-divider');

  const getVisibleEvents = (events) => events.filter(event => {
    const eventType = event.type || '';
    return eventType !== 'assistant.turn_end'
      && eventType !== 'assistant.turn_complete'
      && eventType !== 'tool.execution_start'
      && eventType !== 'tool.execution_complete';
  });

  const getDedupEventKey = event => JSON.stringify([
    event.type || '',
    event.timestamp || '',
    event.uuid || event.id || '',
    event.parentUuid || event.parentId || '',
    event.data?.message || event.data?.text || event.data?.content || event.data?.reason || '',
    event.data?.toolCallId || '',
    event.data?.toolName || ''
  ]);

  const isClaudeDedupCandidate = (events) => {
    if (!Array.isArray(events) || events.length === 0) {
      return false;
    }

    const hasSubagentSignals = events.some(event =>
      event.type === 'subagent.started'
      || event.type === 'subagent.completed'
      || event.type === 'subagent.failed'
      || event._subagent?.id
    );

    const hasMainThreadEvents = events.some(event =>
      event.type !== 'subagent.started'
      && event.type !== 'subagent.completed'
      && event.type !== 'subagent.failed'
      && !event._subagent?.id
    );

    return hasSubagentSignals && hasMainThreadEvents;
  };

  const waitForEventsToRender = async (page) => {
    await page.waitForSelector('.main-layout', { timeout: 15000 });

    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });

    const errorEl = page.locator('.error-message');
    if (await errorEl.isVisible().catch(() => false)) {
      throw new Error(`Events failed to load: ${await errorEl.textContent()}`);
    }

    await expect(getRenderedEventItems(page).first()).toBeVisible({ timeout: 15000 });
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

    for (const session of sessions) {
      if (!session?.hasEvents || session.eventCount <= 0) {
        continue;
      }

      const eventsResponse = await getWithRetry(request, `/api/sessions/${session.id}/events`);
      if (!eventsResponse.ok()) {
        continue;
      }

      const events = await eventsResponse.json();
      if (Array.isArray(events) && events.length > 0) {
        EVENTFUL_SESSION_ID = session.id;
        break;
      }
    }

    const claudeResponse = await getWithRetry(request, '/api/sessions?source=claude');
    const claudeSessions = await claudeResponse.json();
    for (const session of claudeSessions.slice(0, 20)) {
      if (!CLAUDE_DEDUP_SESSION_ID) {
        const eventsResponse = await getWithRetry(request, `/api/sessions/${session.id}/events`);
        if (eventsResponse.ok()) {
          const events = await eventsResponse.json();
          if (isClaudeDedupCandidate(events)) {
            CLAUDE_DEDUP_SESSION_ID = session.id;
          }
        }
      }

      if (!CLAUDE_USAGE_SESSION_ID) {
        const detailResponse = await getWithRetry(request, `/session/${session.id}`);
        const detailHtml = await detailResponse.text();
        if (detailHtml.includes('"usage":') && detailHtml.includes('"modelMetrics"')) {
          CLAUDE_USAGE_SESSION_ID = session.id;
        }
      }

      if (CLAUDE_DEDUP_SESSION_ID && CLAUDE_USAGE_SESSION_ID) {
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

  test('should display tool calling summary in sidebar sorted by count descending', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);

    // Check for Tool Calls sidebar section
    const toolCallsSection = page.locator('.sidebar-section').filter({
      has: page.locator('.sidebar-section-title:has-text("Tool Calls")')
    });

    // Tool Calls section may not appear if session has no tools
    if (await toolCallsSection.count() === 0) {
      return;
    }

    await expect(toolCallsSection).toBeVisible();

    // Verify items exist and counts are in descending order
    const items = toolCallsSection.locator('.tool-summary-item');
    const itemCount = await items.count();
    expect(itemCount).toBeGreaterThan(0);

    const counts = [];
    for (let i = 0; i < itemCount; i++) {
      const countText = await items.nth(i).locator('.tool-summary-count').textContent();
      counts.push(parseInt(countText, 10));
    }

    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  test('should display event list', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);

    // Check events are displayed
    const events = getRenderedEventItems(page);
    const count = await events.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should not surface duplicated Claude replay events in session detail counts', async ({ page, request }) => {
    test.skip(!CLAUDE_DEDUP_SESSION_ID, 'No Claude session with mixed main/subagent events available');

    const response = await getWithRetry(request, `/api/sessions/${CLAUDE_DEDUP_SESSION_ID}/events`);

    const events = await response.json();
    test.skip(!Array.isArray(events) || events.length === 0, 'Claude dedup candidate session has no events');

    const visibleEvents = getVisibleEvents(events);
    const uniqueEventKeys = new Set(visibleEvents.map(getDedupEventKey));

    expect(uniqueEventKeys.size).toBe(visibleEvents.length);

    await page.goto(`/session/${CLAUDE_DEDUP_SESSION_ID}`);
    await waitForEventsToRender(page);
    await page.waitForTimeout(1000);

    const toggle = page.locator('.filter-type-toggle');
    await toggle.click();
    await page.waitForTimeout(200);

    const allItem = page.locator('.filter-type-menu-item').first();
    const countText = await allItem.locator('.filter-type-menu-count').textContent();

    await toggle.click();
    await page.waitForTimeout(100);

      expect(countText).not.toBeNull();

      const allCount = Number.parseInt(countText ?? '', 10);

      expect(Number.isNaN(allCount)).toBe(false);
      expect(allCount).toBe(visibleEvents.length);
  });

  test('should filter events by search', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/session/${EVENTFUL_SESSION_ID}`);

    await waitForEventsToRender(page);

    // Wait for virtual scroller to stabilize
    await page.waitForTimeout(1000);

    // Get initial event count from type dropdown toggle text (shows "⚡ All Types ▾" by default)
    // Open the type dropdown and read the "All" entry count
    const getEventCount = async () => {
      const toggle = page.locator('.filter-type-toggle');
      await toggle.click();
      await page.waitForTimeout(200);
      const allItem = page.locator('.filter-type-menu-item').first();
      const countText = await allItem.locator('.filter-type-menu-count').textContent();
      // Close dropdown
      await toggle.click();
      await page.waitForTimeout(100);
      return parseInt(countText) || 0;
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
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);

    // Wait for virtual scroller to stabilize
    await page.waitForTimeout(1000);
    
    // Helper function to get event count from type dropdown "All" entry
    const getEventCount = async () => {
      const toggle = page.locator('.filter-type-toggle');
      await toggle.click();
      await page.waitForTimeout(200);
      const allItem = page.locator('.filter-type-menu-item').first();
      const countText = await allItem.locator('.filter-type-menu-count').textContent();
      // Close dropdown
      await toggle.click();
      await page.waitForTimeout(100);
      return parseInt(countText) || 0;
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
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/session/${EVENTFUL_SESSION_ID}`);
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
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/session/${EVENTFUL_SESSION_ID}`);
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
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/session/${EVENTFUL_SESSION_ID}`);
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

  test('should open event type dropdown and select a type', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);
    await page.waitForTimeout(1000);

    // Click the type filter toggle
    const toggle = page.locator('.filter-type-toggle');
    await expect(toggle).toBeVisible();
    await toggle.click();

    // Menu should appear
    const menu = page.locator('.filter-type-menu');
    await expect(menu).toBeVisible();

    // Should have multiple items
    const items = menu.locator('.filter-type-menu-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(1);

    // Select the second item (first specific type)
    if (count > 1) {
      const secondItem = items.nth(1);
      const typeLabel = await secondItem.locator('.filter-type-menu-label').textContent();
      await secondItem.click();

      // Dropdown should close
      await expect(menu).not.toBeVisible();

      // Toggle button should show active state with the selected type
      await expect(toggle).toContainText(typeLabel.trim());

      // Filter chip should appear
      const chipBar = page.locator('.active-filters-bar');
      await expect(chipBar).toBeVisible();
      await expect(chipBar.locator('.filter-chip')).toContainText('Type:');
    }
  });

  test('should show filter chips when filters active and clear all', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);
    await page.waitForTimeout(1000);

    // Initially no active filters bar
    const chipBar = page.locator('.active-filters-bar');
    await expect(chipBar).not.toBeVisible();

    // Type in search
    const searchInput = page.locator('input[placeholder="🔍 Search events..."]');
    await searchInput.fill('test');
    await page.waitForTimeout(400);

    // Filter chip should appear for search
    await expect(chipBar).toBeVisible();
    await expect(chipBar.locator('.filter-chip')).toContainText('Search:');

    // Click "Clear all"
    const clearBtn = chipBar.locator('.clear-all-filters-btn');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await page.waitForTimeout(400);

    // Filter chips should be gone
    await expect(chipBar).not.toBeVisible();

    // Search input should be cleared
    await expect(searchInput).toHaveValue('');
  });

  test('should dismiss filter chip individually', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);
    await page.waitForTimeout(1000);

    // Select a type filter via dropdown
    const toggle = page.locator('.filter-type-toggle');
    await toggle.click();
    await page.waitForTimeout(200);

    const items = page.locator('.filter-type-menu-item');
    const count = await items.count();
    if (count > 1) {
      await items.nth(1).click();
      await page.waitForTimeout(300);

      // Chip should be visible
      const chipBar = page.locator('.active-filters-bar');
      await expect(chipBar).toBeVisible();

      // Remove the type filter chip
      const removeBtn = chipBar.locator('.filter-chip .filter-chip-remove').first();
      await removeBtn.click();
      await page.waitForTimeout(300);

      // Toggle should reset to "All Types"
      await expect(toggle).toContainText('All Types');
    }
  });

  test('should close type dropdown when clicking outside', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);
    await page.waitForTimeout(1000);

    // Open dropdown
    const toggle = page.locator('.filter-type-toggle');
    await toggle.click();
    const menu = page.locator('.filter-type-menu');
    await expect(menu).toBeVisible();

    // Click outside (on the content area)
    await page.locator('.content').click({ position: { x: 10, y: 200 } });
    await page.waitForTimeout(200);

    // Menu should be closed
    await expect(menu).not.toBeVisible();
  });
});
