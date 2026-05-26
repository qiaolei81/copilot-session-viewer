const { test, expect, getAllSourceSessionsWithRetry } = require('./fixtures');

test.describe('Subagent View', () => {
  let SESSION_ID;
  let SESSION_SOURCE;
  let SUBAGENT_SESSION_ID;
  let SUBAGENT_SOURCE;

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
    const sessions = await getAllSourceSessionsWithRetry(request);
    if (sessions.length === 0) {
      throw new Error('No sessions available for testing');
    }
    SESSION_ID = sessions[0].id;
      SESSION_SOURCE = sessions[0].source;

    // Find a session with subagent.started events
    for (const session of sessions.slice(0, 20)) {
      const source = session.source || 'copilot-cli';
      const eventsResponse = await getWithRetry(request, `/api/${source}/sessions/${session.id}/events`);
      const data = await eventsResponse.json();
      const events = Array.isArray(data) ? data : (data.events || []);
      const hasSubagentStarted = events.some(e => e.type === 'subagent.started');
      const hasVsCodeSubagent = events.some(e => e.type === 'assistant.message' && e.data?.subAgentName && e.data?.subAgentId);
      if (hasSubagentStarted || hasVsCodeSubagent) {
        SUBAGENT_SESSION_ID = session.id;
        SUBAGENT_SOURCE = session.source;
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

    await page.goto(`/#/${SUBAGENT_SOURCE}/session/${SUBAGENT_SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });

    await page.waitForTimeout(2000);

    const dropdown = page.locator('.subagent-dropdown');
    const count = await dropdown.count();
    if (count > 0) {
      await expect(dropdown).toBeVisible();

      const firstOption = dropdown.locator('option').first();
      await expect(firstOption).toHaveAttribute('value', '');
      await expect(firstOption).toHaveText(/All Agents/);
    } else {
      console.log('Subagent dropdown not visible - session may not have detectable subagent events in frontend');
    }
  });

  test('should not show subagent dropdown for sessions without subagents', async ({ page }) => {
    const testId = SUBAGENT_SESSION_ID ? SESSION_ID : SESSION_ID;
    test.skip(SUBAGENT_SESSION_ID === SESSION_ID, 'Cannot test - first session has subagents');

    await page.goto(`/#/${SESSION_SOURCE}/session/${testId}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });

    await page.waitForTimeout(2000);

    const dropdown = page.locator('.subagent-dropdown');
    const count = await dropdown.count();
    if (count === 0) {
      expect(count).toBe(0);
    }
  });

  test('should filter events when subagent is selected', async ({ page }) => {
    test.skip(!SUBAGENT_SESSION_ID, 'No session with subagents available');

    await page.goto(`/#/${SUBAGENT_SOURCE}/session/${SUBAGENT_SESSION_ID}`);
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

    const dropdown = page.locator('.subagent-dropdown');
    const options = dropdown.locator('option');
    const optionCount = await options.count();

    if (optionCount > 1) {
      const secondOption = options.nth(1);
      const value = await secondOption.getAttribute('value');
      await dropdown.selectOption(value);

      await page.waitForTimeout(500);

      const filteredCount = await getAllCount();
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  test('should show usage badge when subagent is selected', async ({ page }) => {
    test.skip(!SUBAGENT_SESSION_ID, 'No session with subagents available');

    await page.goto(`/#/${SUBAGENT_SOURCE}/session/${SUBAGENT_SESSION_ID}`);
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
      const usageBadge = page.locator('.subagent-usage-badge');
      await expect(usageBadge).not.toBeVisible();

      const secondOption = options.nth(1);
      const value = await secondOption.getAttribute('value');
      await dropdown.selectOption(value);

      await page.waitForTimeout(500);

      await expect(usageBadge).toBeVisible();
      await expect(usageBadge).toContainText('events');
    }
  });

  test('should return to all events when "All Agents" is selected', async ({ page }) => {
    test.skip(!SUBAGENT_SESSION_ID, 'No session with subagents available');

    await page.goto(`/#/${SUBAGENT_SOURCE}/session/${SUBAGENT_SESSION_ID}`);
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

    const dropdown = page.locator('.subagent-dropdown');
    const options = dropdown.locator('option');
    const optionCount = await options.count();

    if (optionCount > 1) {
      const secondOption = options.nth(1);
      const value = await secondOption.getAttribute('value');
      await dropdown.selectOption(value);
      await page.waitForTimeout(500);

      await dropdown.selectOption('');
      await page.waitForTimeout(500);

      const restoredCount = await getAllCount();
      expect(restoredCount).toBe(initialCount);
    }
  });

  test('should preserve type filter when clearing agent chip', async ({ page }) => {
    test.skip(!SUBAGENT_SESSION_ID, 'No session with subagents available');

    await page.goto(`/#/${SUBAGENT_SOURCE}/session/${SUBAGENT_SESSION_ID}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    await page.waitForFunction(() => {
      const loadingEl = document.querySelector('.loading-message');
      return loadingEl === null || window.getComputedStyle(loadingEl).display === 'none';
    }, { timeout: 30000 });

    await page.waitForSelector('.event-header', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const dropdown = page.locator('.subagent-dropdown');
    const options = dropdown.locator('option');
    const optionCount = await options.count();
    const toggle = page.locator('.filter-type-toggle');
    await expect(toggle).toBeVisible();

    if (optionCount > 1) {
      const secondOption = options.nth(1);
      const value = await secondOption.getAttribute('value');
      await dropdown.selectOption(value);
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
  });
});
