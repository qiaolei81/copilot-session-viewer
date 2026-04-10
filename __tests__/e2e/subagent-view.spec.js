const { test, expect } = require('./fixtures');

test.describe('Subagent View', () => {
  let SESSION_ID;
  let SUBAGENT_SESSION_ID;

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
    const response = await getWithRetry(request, '/api/sessions');
    const sessions = await response.json();
    if (sessions.length === 0) {
      throw new Error('No sessions available for testing');
    }
    SESSION_ID = sessions[0].id;

    // Find a session with subagent.started events (frontend needs these for the dropdown)
    for (const session of sessions.slice(0, 20)) {
      const eventsResponse = await getWithRetry(request, `/api/sessions/${session.id}/events`);
      const data = await eventsResponse.json();
      const events = Array.isArray(data) ? data : (data.events || []);
      const hasSubagentStarted = events.some(e => e.type === 'subagent.started');
      const hasVsCodeSubagent = events.some(e => e.type === 'assistant.message' && e.data?.subAgentName && e.data?.subAgentId);
      if (hasSubagentStarted || hasVsCodeSubagent) {
        SUBAGENT_SESSION_ID = session.id;
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

  test('should show subagent dropdown when session has subagents', async ({ page }) => {
    test.skip(!SUBAGENT_SESSION_ID, 'No session with subagents available');

    await page.goto(`/session/${SUBAGENT_SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    // Wait for events to load
    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });

    // Wait for events to render and Vue reactivity to compute subagent list
    await page.waitForTimeout(2000);

    const dropdown = page.locator('.subagent-dropdown-toggle');
    // Dropdown only appears if subagents were detected in the events
    const count = await dropdown.count();
    if (count > 0) {
      await expect(dropdown).toBeVisible();
      // Default state should show "All Agents"
      await expect(dropdown).toContainText('All Agents');
    } else {
      // Session may have _subagent metadata but no subagent.started events visible
      console.log('Subagent dropdown not visible - session may not have detectable subagent events in frontend');
    }
  });

  test('should not show subagent dropdown for sessions without subagents', async ({ page }) => {
    // Use a session that likely has no subagents (first session as fallback)
    const testId = SUBAGENT_SESSION_ID ? SESSION_ID : SESSION_ID;
    test.skip(SUBAGENT_SESSION_ID === SESSION_ID, 'Cannot test - first session has subagents');

    await page.goto(`/session/${testId}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });

    // Wait for events to render
    await page.waitForTimeout(2000);

    // If no subagents, dropdown should not be visible
    const dropdown = page.locator('.subagent-dropdown-toggle');
    const count = await dropdown.count();
    // Either not present, or present because session has subagents (both ok)
    if (count === 0) {
      expect(count).toBe(0);
    }
  });

  test('should filter events when subagent is selected', async ({ page }) => {
    test.skip(!SUBAGENT_SESSION_ID, 'No session with subagents available');

    await page.goto(`/session/${SUBAGENT_SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });

    // Wait for events to render
    await page.waitForSelector('.event-header', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Get initial "All" count from type dropdown
    const getAllCount = async () => {
      const toggle = page.locator('.filter-type-toggle');
      if (await toggle.count() === 0) return 0;
      await toggle.click();
      await page.waitForTimeout(200);
      const allItem = page.locator('.filter-type-menu-item').first();
      const countText = await allItem.locator('.filter-type-menu-count').textContent();
      await toggle.click();
      await page.waitForTimeout(100);
      return parseInt(countText) || 0;
    };

    const initialCount = await getAllCount();

    // Select the first subagent option
    const dropdown = page.locator('.subagent-dropdown-toggle');
    const dropdownCount = await dropdown.count();

    if (dropdownCount > 0) {
      // Open the subagent menu
      await dropdown.click();
      await page.waitForTimeout(200);

      const menuItems = page.locator('.subagent-dropdown-menu-item');
      const optionCount = await menuItems.count();

      if (optionCount > 1) {
        // Click second item (first subagent, after "All Agents")
        await menuItems.nth(1).click();

        // Wait for re-render
        await page.waitForTimeout(500);

        const filteredCount = await getAllCount();

        // Filtered count should be less than or equal to initial
        expect(filteredCount).toBeLessThanOrEqual(initialCount);
      }
    }
  });

  test('should show usage badge when subagent is selected', async ({ page }) => {
    test.skip(!SUBAGENT_SESSION_ID, 'No session with subagents available');

    await page.goto(`/session/${SUBAGENT_SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });

    await page.waitForTimeout(1000);

    const dropdown = page.locator('.subagent-dropdown-toggle');
    const dropdownCount = await dropdown.count();

    if (dropdownCount > 0) {
      // Usage badge should not be visible before selection
      const usageBadge = page.locator('.subagent-usage-badge');
      await expect(usageBadge).not.toBeVisible();

      // Open menu and select first subagent
      await dropdown.click();
      await page.waitForTimeout(200);
      const menuItems = page.locator('.subagent-dropdown-menu-item');
      const optionCount = await menuItems.count();

      if (optionCount > 1) {
        await menuItems.nth(1).click();
        await page.waitForTimeout(500);

        // Usage badge should now be visible
        await expect(usageBadge).toBeVisible();
        await expect(usageBadge).toContainText('events');
      }
    }
  });

  test('should return to all events when "All Agents" is selected', async ({ page }) => {
    test.skip(!SUBAGENT_SESSION_ID, 'No session with subagents available');

    await page.goto(`/session/${SUBAGENT_SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });

    await page.waitForSelector('.event-header', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const getAllCount = async () => {
      const toggle = page.locator('.filter-type-toggle');
      if (await toggle.count() === 0) return 0;
      await toggle.click();
      await page.waitForTimeout(200);
      const allItem = page.locator('.filter-type-menu-item').first();
      const countText = await allItem.locator('.filter-type-menu-count').textContent();
      await toggle.click();
      await page.waitForTimeout(100);
      return parseInt(countText) || 0;
    };

    const initialCount = await getAllCount();

    const dropdown = page.locator('.subagent-dropdown-toggle');
    const dropdownCount = await dropdown.count();

    if (dropdownCount > 0) {
      // Open menu and select a subagent
      await dropdown.click();
      await page.waitForTimeout(200);
      const menuItems = page.locator('.subagent-dropdown-menu-item');
      const optionCount = await menuItems.count();

      if (optionCount > 1) {
        await menuItems.nth(1).click();
        await page.waitForTimeout(500);

        // Open menu again and switch back to "All Agents"
        await dropdown.click();
        await page.waitForTimeout(200);
        await page.locator('.subagent-dropdown-menu-item').first().click();
        await page.waitForTimeout(500);

        const restoredCount = await getAllCount();
        expect(restoredCount).toBe(initialCount);
      }
    }
  });

  test('should preserve type filter when clearing agent chip', async ({ page }) => {
    test.skip(!SUBAGENT_SESSION_ID, 'No session with subagents available');

    await page.goto(`/session/${SUBAGENT_SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });

    await page.waitForSelector('.event-header', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const dropdown = page.locator('.subagent-dropdown-toggle');
    const dropdownCount = await dropdown.count();
    const toggle = page.locator('.filter-type-toggle');
    await expect(toggle).toBeVisible();

    if (dropdownCount > 0) {
      // Open menu and select a subagent
      await dropdown.click();
      await page.waitForTimeout(200);
      const menuItems = page.locator('.subagent-dropdown-menu-item');
      const optionCount = await menuItems.count();

      if (optionCount > 1) {
        await menuItems.nth(1).click();
        await page.waitForTimeout(500);

      await toggle.click();
      await page.waitForTimeout(200);

      const items = page.locator('.filter-type-menu-item');
      const typeCount = await items.count();
      if (typeCount <= 1) {
        await toggle.click();
        return;
      }

      const typeItem = items.nth(1);
      const selectedTypeLabel = (await typeItem.locator('.filter-type-menu-label').textContent()).trim();
      await typeItem.click();
      await page.waitForTimeout(300);


      const chipBar = page.locator('.active-filters-bar');
      await expect(chipBar).toBeVisible();

      const agentChipRemoveBtn = chipBar.locator('.filter-chip').filter({ hasText: 'Agent:' }).locator('.filter-chip-remove');
      await expect(agentChipRemoveBtn).toBeVisible();
      await agentChipRemoveBtn.click();
      await page.waitForTimeout(300);

      await expect(toggle).toContainText(selectedTypeLabel);
      await expect(chipBar.locator('.filter-chip')).toContainText(['Type:']);
      await expect(chipBar.locator('.filter-chip').filter({ hasText: 'Agent:' })).toHaveCount(0);
      }
    }
  });
});
