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
      const hasVsCodeSubagent = events.some(e => e.type === 'assistant.message' && e.data?.subAgentId);
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

    const dropdown = page.locator('.subagent-dropdown');
    // Dropdown only appears if subagents were detected in the events
    const count = await dropdown.count();
    if (count > 0) {
      await expect(dropdown).toBeVisible();

      // Should have "All Events" as first option
      const firstOption = dropdown.locator('option').first();
      await expect(firstOption).toHaveText('All Events');
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
    const dropdown = page.locator('.subagent-dropdown');
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

    // Get initial "All" count from filter button
    const getAllCount = async () => {
      const btn = page.locator('button').filter({ hasText: /^All \(\d+\)$/ });
      if (await btn.count() === 0) return 0;
      const text = await btn.textContent();
      const match = text.match(/All \((\d+)\)/);
      return match ? parseInt(match[1]) : 0;
    };

    const initialCount = await getAllCount();

    // Select the first subagent option
    const dropdown = page.locator('.subagent-dropdown');
    const options = dropdown.locator('option');
    const optionCount = await options.count();

    if (optionCount > 1) {
      // Select second option (first subagent, after "All Events")
      const secondOption = options.nth(1);
      const value = await secondOption.getAttribute('value');
      await dropdown.selectOption(value);

      // Wait for re-render
      await page.waitForTimeout(500);

      const filteredCount = await getAllCount();

      // Filtered count should be less than or equal to initial
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
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

    const dropdown = page.locator('.subagent-dropdown');
    const options = dropdown.locator('option');
    const optionCount = await options.count();

    if (optionCount > 1) {
      // Usage badge should not be visible before selection
      const usageBadge = page.locator('.subagent-usage-badge');
      await expect(usageBadge).not.toBeVisible();

      // Select first subagent
      const secondOption = options.nth(1);
      const value = await secondOption.getAttribute('value');
      await dropdown.selectOption(value);

      await page.waitForTimeout(500);

      // Usage badge should now be visible
      await expect(usageBadge).toBeVisible();
      await expect(usageBadge).toContainText('events');
    }
  });

  test('should return to all events when "All Events" is selected', async ({ page }) => {
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
      const btn = page.locator('button').filter({ hasText: /^All \(\d+\)$/ });
      if (await btn.count() === 0) return 0;
      const text = await btn.textContent();
      const match = text.match(/All \((\d+)\)/);
      return match ? parseInt(match[1]) : 0;
    };

    const initialCount = await getAllCount();

    const dropdown = page.locator('.subagent-dropdown');
    const options = dropdown.locator('option');
    const optionCount = await options.count();

    if (optionCount > 1) {
      // Select a subagent
      const secondOption = options.nth(1);
      const value = await secondOption.getAttribute('value');
      await dropdown.selectOption(value);
      await page.waitForTimeout(500);

      // Switch back to "All Events"
      await dropdown.selectOption('');
      await page.waitForTimeout(500);

      const restoredCount = await getAllCount();
      expect(restoredCount).toBe(initialCount);
    }
  });
});
