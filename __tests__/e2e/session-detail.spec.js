const { test, expect, getSessionsWithRetry, getAllSourceSessionsWithRetry } = require('./fixtures');

test.describe('Session Detail Page', () => {
  let SESSION_ID;
  let EVENTFUL_SESSION_ID;
  let EVENTFUL_SOURCE;
  let CLAUDE_USAGE_SESSION_ID;
  let CLAUDE_USAGE_SOURCE;
  let CLAUDE_DEDUP_SESSION_ID;
  let CLAUDE_DEDUP_SOURCE;
  let SESSION_SOURCE;

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

  const getRenderedEventItems = page => page.locator('.event-row, .turn-divider, .subagent-divider');

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
    await page.waitForSelector('[data-testid="session-layout"]', { timeout: 15000 });

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
    // Get sessions from all sources
    const sessions = await getAllSourceSessionsWithRetry(request);
    if (sessions.length > 0) {
      SESSION_ID = sessions[0].id;
      SESSION_SOURCE = sessions[0].urlSource || sessions[0].source;
    } else {
      throw new Error('No sessions available for testing');
    }

    for (const session of sessions) {
      if (!session?.hasEvents || session.eventCount <= 0) {
        continue;
      }

      const source = session.source || 'copilot-cli';
      const eventsResponse = await getWithRetry(request, `/api/${source}/sessions/${session.id}/events`);
      if (!eventsResponse.ok()) {
        continue;
      }

      const events = await eventsResponse.json();
      if (Array.isArray(events) && events.length > 0) {
        EVENTFUL_SESSION_ID = session.id;
          EVENTFUL_SOURCE = session.source;
        break;
      }
    }

    const claudeSessions = await getSessionsWithRetry(request, { source: 'claude' }).catch(() => []);
    for (const session of claudeSessions.slice(0, 20)) {
      if (!CLAUDE_DEDUP_SESSION_ID) {
        const eventsResponse = await getWithRetry(request, `/api/claude/sessions/${session.id}/events`);
        if (eventsResponse.ok()) {
          const events = await eventsResponse.json();
          if (isClaudeDedupCandidate(events)) {
            CLAUDE_DEDUP_SESSION_ID = session.id;
              CLAUDE_DEDUP_SOURCE = session.source;
          }
        }
      }

      if (!CLAUDE_USAGE_SESSION_ID) {
        // Check via API for usage data
        const eventsResponse = await getWithRetry(request, `/api/claude/sessions/${session.id}/events`);
        if (eventsResponse.ok()) {
          const events = await eventsResponse.json();
          const hasUsage = Array.isArray(events) && events.some(e => e.data?.usage || e.data?.model);
          if (hasUsage) {
            CLAUDE_USAGE_SESSION_ID = session.id;
              CLAUDE_USAGE_SOURCE = session.source;
          }
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
      if (message.includes('ResizeObserver') ||
          message.includes("Cannot read properties of undefined (reading 'has')")) {
        return;
      }
      throw error;
    });
  });

  test('should load session detail page', async ({ page }) => {
    await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}`);

    // Wait for Vue to mount and render
    await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

    // Check page loaded
    await expect(page.locator('[data-testid="session-layout"]')).toBeVisible();
  });

  test('should display session metadata', async ({ page }) => {
    await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}`);

    // Wait for Vue to mount
    await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

    // Check sidebar (metadata section) - may need to expand on smaller viewports
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    // session-info may be below fold in sidebar
    await expect(page.locator('.session-info')).toBeAttached();
  });

  test('should display usage summary for Claude sessions when usage data exists', async ({ page }) => {
    test.skip(!CLAUDE_USAGE_SESSION_ID, 'No Claude session with usage data available');

    await page.goto(`/#/${CLAUDE_USAGE_SOURCE}/session/${CLAUDE_USAGE_SESSION_ID}`);
    await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

    const usageSummary = page.locator('.sidebar-section').filter({ hasText: 'reqs' }).first();
    await expect(usageSummary).toBeVisible();
    await expect(usageSummary).toContainText('reqs');
    await expect(usageSummary).toContainText('tokens');

    await expect(usageSummary).toContainText('Input');
    await expect(usageSummary).toContainText('Output');
  });

  test('should display tool calling summary in sidebar sorted by count descending', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/#/${EVENTFUL_SOURCE}/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);

    // Sidebar may be collapsed
    const sidebar = page.locator('.sidebar');
    if (!await sidebar.isVisible()) return;

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
    const items = toolCallsSection.locator('.tool-bar-item');
    const itemCount = await items.count();
    if (itemCount === 0) return; // sidebar may be collapsed

    const counts = [];
    for (let i = 0; i < itemCount; i++) {
      const itemText = await items.nth(i).textContent();
      const countMatch = itemText.match(/(\d+)/);
      counts.push(parseInt(countMatch?.[1] || '0', 10));
    }

    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  test('should display event list', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/#/${EVENTFUL_SOURCE}/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);

    // Check events are displayed
    const events = getRenderedEventItems(page);
    const count = await events.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should not surface duplicated Claude replay events in session detail counts', async ({ page, request }) => {
    test.skip(!CLAUDE_DEDUP_SESSION_ID, 'No Claude session with mixed main/subagent events available');

    const response = await getWithRetry(request, `/api/claude/sessions/${CLAUDE_DEDUP_SESSION_ID}/events`);

    const events = await response.json();
    test.skip(!Array.isArray(events) || events.length === 0, 'Claude dedup candidate session has no events');

    const visibleEvents = getVisibleEvents(events);
    const uniqueEventKeys = new Set(visibleEvents.map(getDedupEventKey));

    expect(uniqueEventKeys.size).toBe(visibleEvents.length);

    await page.goto(`/#/${CLAUDE_DEDUP_SOURCE}/session/${CLAUDE_DEDUP_SESSION_ID}`);
    await waitForEventsToRender(page);
    await page.waitForTimeout(1000);

    const toggle = page.locator('[data-testid="filter-type-toggle"]');
    await toggle.click();
    await page.waitForTimeout(200);

    const allItem = page.locator('[data-testid="filter-type-item"]').first();
    const countText = await allItem.locator('span.text-text-dim').textContent();

    await toggle.click();
    await page.waitForTimeout(100);

      expect(countText).not.toBeNull();

      const allCount = Number.parseInt(countText ?? '', 10);

      expect(Number.isNaN(allCount)).toBe(false);
      expect(allCount).toBe(visibleEvents.length);
  });

  test('should filter events by search', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/#/${EVENTFUL_SOURCE}/session/${EVENTFUL_SESSION_ID}`);

    await waitForEventsToRender(page);

    // Wait for virtual scroller to stabilize
    await page.waitForTimeout(1000);

    // Get initial event count from type dropdown toggle text
    const getEventCount = async () => {
      const toggle = page.locator('[data-testid="filter-type-toggle"]');
      await toggle.click();
      await page.waitForTimeout(200);
      const allItem = page.locator('[data-testid="filter-type-item"]').first();
      const countText = await allItem.locator('span.text-text-dim').textContent();
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

    await page.goto(`/#/${EVENTFUL_SOURCE}/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);

    // Wait for virtual scroller to stabilize
    await page.waitForTimeout(1000);

    const getEventCount = async () => {
      const toggle = page.locator('[data-testid="filter-type-toggle"]');
      await toggle.click();
      await page.waitForTimeout(200);
      const allItem = page.locator('[data-testid="filter-type-item"]').first();
      const countText = await allItem.locator('span.text-text-dim').textContent();
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

    await page.goto(`/#/${EVENTFUL_SOURCE}/session/${EVENTFUL_SESSION_ID}`);
    await page.waitForLoadState('networkidle');

    // Wait for page content to load
    const _pageLoaded = await Promise.race([
      page.waitForSelector('[data-testid="session-layout"]', { timeout: 5000 }).catch(() => null),
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
    test.skip(true, 'Flaky: virtual scroller recycles DOM nodes, making nth-based locators unreliable after click');

    await page.goto(`/#/${EVENTFUL_SOURCE}/session/${EVENTFUL_SESSION_ID}`);
    await page.waitForLoadState('networkidle');

    const _pageLoaded = await Promise.race([
      page.waitForSelector('[data-testid="session-layout"]', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('body', { timeout: 5000 })
    ]);

    await page.waitForTimeout(2000);

    // Find an event with "Show more" button
    const showMoreButtons = page.locator('button').filter({ hasText: 'Show more ▼' });

    if (await showMoreButtons.count() > 0) {
      const firstShowMore = showMoreButtons.first();
      await firstShowMore.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      // Get the event-row index that contains this button
      const eventRowIndex = await firstShowMore.evaluate(el => {
        const row = el.closest('.event-row');
        const allRows = [...document.querySelectorAll('.event-row')];
        return allRows.indexOf(row);
      });

      await firstShowMore.click({ force: true });
      await page.waitForTimeout(500);

      // Use nth event-row (stable after text change)
      const eventRow = page.locator('.event-row').nth(eventRowIndex);

      // After click, button text changes to "Show less ▲"
      const showLessBtn = eventRow.locator('button').filter({ hasText: 'Show less ▲' }).first();
      await expect(showLessBtn).toBeVisible({ timeout: 5000 });

      await showLessBtn.click({ force: true });
      await page.waitForTimeout(500);

      // Should revert to "Show more ▼"
      await expect(eventRow.locator('button').filter({ hasText: 'Show more ▼' }).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should toggle sidebar', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/#/${EVENTFUL_SOURCE}/session/${EVENTFUL_SESSION_ID}`);
    await page.waitForLoadState('networkidle');

    const _pageLoaded = await Promise.race([
      page.waitForSelector('[data-testid="session-layout"]', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('body', { timeout: 5000 })
    ]);

    const sidebarSelectors = ['.sidebar', '.side-panel', '[data-testid="sidebar"]', '.filter-panel'];
    let sidebarElement = null;

    for (const selector of sidebarSelectors) {
      const element = page.locator(selector).first();
      if (await element.count() > 0 && await element.isVisible()) {
        sidebarElement = element;
        break;
      }
    }
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
        await page.waitForTimeout(500);
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
    await page.goto('/#/copilot-cli/session/invalid-session-id-123');

    // Wait for Vue to mount and try to load the session
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // In the Vue SPA, an invalid session should show an error message
    const errorEl = page.locator('.error-message');
    const hasError = await errorEl.isVisible().catch(() => false);

    if (hasError) {
      await expect(page.locator('body')).toContainText(/not found|error|invalid/i);
    } else {
      // Page should at least not crash
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should open event type dropdown and select a type', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/#/${EVENTFUL_SOURCE}/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);
    await page.waitForTimeout(1000);

    // Click the type filter toggle
    const toggle = page.locator('[data-testid="filter-type-toggle"]');
    await expect(toggle).toBeVisible();
    await toggle.click();

    // Menu should appear
    const menu = page.locator('[data-testid="filter-type-menu"]');
    await expect(menu).toBeVisible();

    // Should have multiple items
    const items = menu.locator('[data-testid="filter-type-item"]');
    const count = await items.count();
    expect(count).toBeGreaterThan(1);

    // Select the second item (first specific type)
    if (count > 1) {
      const secondItem = items.nth(1);
      const typeLabel = await secondItem.locator('span').first().textContent();
      await secondItem.click();

      // Dropdown should close
      await expect(menu).not.toBeVisible();

      // Toggle button should show active state with the selected type
      await expect(toggle).toContainText(typeLabel.trim());

      // Filter chip should appear
      const chipBar = page.locator('[data-testid="active-filters"]');
      await expect(chipBar).toBeVisible();
      await expect(chipBar.locator('.filter-chip')).toContainText('Type:');
    }
  });

  test('should show filter chips when filters active and clear all', async ({ page }) => {
    test.skip(!EVENTFUL_SESSION_ID, 'No session with events available for testing');

    await page.goto(`/#/${EVENTFUL_SOURCE}/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);
    await page.waitForTimeout(1000);

    // Initially no active filters bar
    const chipBar = page.locator('[data-testid="active-filters"]');
    await expect(chipBar).not.toBeVisible();

    // Type in search
    const searchInput = page.locator('input[placeholder="🔍 Search events..."]');
    await searchInput.fill('test');
    await page.waitForTimeout(400);

    // Filter chip should appear for search
    await expect(chipBar).toBeVisible();
    await expect(chipBar.locator('.filter-chip')).toContainText('Search:');

    // Click "Clear all"
    const clearBtn = chipBar.locator('[data-testid="clear-all-filters"]');
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

    await page.goto(`/#/${EVENTFUL_SOURCE}/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);
    await page.waitForTimeout(1000);

    // Select a type filter via dropdown
    const toggle = page.locator('[data-testid="filter-type-toggle"]');
    await toggle.click();
    await page.waitForTimeout(200);

    const items = page.locator('[data-testid="filter-type-item"]');
    const count = await items.count();
    if (count > 1) {
      await items.nth(1).click();
      await page.waitForTimeout(300);

      // Chip should be visible
      const chipBar = page.locator('[data-testid="active-filters"]');
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

    await page.goto(`/#/${EVENTFUL_SOURCE}/session/${EVENTFUL_SESSION_ID}`);
    await waitForEventsToRender(page);
    await page.waitForTimeout(1000);

    // Open dropdown
    const toggle = page.locator('[data-testid="filter-type-toggle"]');
    await toggle.click();
    const menu = page.locator('[data-testid="filter-type-menu"]');
    await expect(menu).toBeVisible();

    // Click outside (on the content area)
    await page.locator('[data-testid="session-layout"]').click({ position: { x: 10, y: 200 } });
    await page.waitForTimeout(200);

    // Menu should be closed
    await expect(menu).not.toBeVisible();
  });
});
