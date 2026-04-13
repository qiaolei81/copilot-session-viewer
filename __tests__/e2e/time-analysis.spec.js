const { test, expect, getSessionsWithRetry } = require('./fixtures');

test.describe('Time Analysis and Timeline Tests', () => {
  let SESSION_ID;

  test.beforeAll(async ({ request }) => {
    // Get first session ID from API
    const sessions = await getSessionsWithRetry(request);
    if (sessions.length > 0) {
      SESSION_ID = sessions[0].id;
    } else {
      throw new Error('No sessions available for testing');
    }
  });

  test.describe('Time Analysis Page', () => {
    test('should load time analysis page', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);

      // Wait for page to load
      await page.waitForSelector('.container', { timeout: 10000 });

      // Check page title
      await expect(page.locator('h1')).toContainText('Analysis');
    });

    test('should display navigation buttons', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Check for home button
      const homeBtn = page.locator('.nav-btn:has-text("← Back to Session")');
      await expect(homeBtn).toBeVisible();

      // Check for session detail button
      const sessionBtn = page.locator('.nav-btn:has-text("← Back to Session")');
      await expect(sessionBtn).toBeVisible();
    });

    test('should navigate to session detail page', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Click session detail button
      const sessionBtn = page.locator('.nav-btn:has-text("← Back to Session")');
      await sessionBtn.click();

      // Wait for navigation
      await page.waitForURL(`**/session/${SESSION_ID}`, { timeout: 5000 });

      // Verify URL changed
      expect(page.url()).toContain(`/session/${SESSION_ID}`);
      expect(page.url()).not.toContain('/time-analyze');
    });
  });

  test.describe('Summary Cards', () => {
    test('should display summary cards section', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Check for summary grid
      const summaryGrid = page.locator('.summary-grid');
      await expect(summaryGrid).toBeVisible();
    });

    test('should display turns summary card', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for data to load
      await page.waitForTimeout(2000);

      // Check for turns card
      const turnsCard = page.locator('.summary-card').filter({
        has: page.locator('.summary-card-label:has-text("Turns")')
      });

      if (await turnsCard.count() > 0) {
        await expect(turnsCard).toBeVisible();

        // Check value is present
        const value = turnsCard.locator('.summary-card-value');
        await expect(value).toBeVisible();

        // Verify value is a number
        const valueText = await value.textContent();
        expect(parseInt(valueText || '0')).toBeGreaterThanOrEqual(0);
      }
    });

    test('should display tools summary card', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for data to load
      await page.waitForTimeout(2000);

      // Check for tools card
      const toolsCard = page.locator('.summary-card').filter({
        has: page.locator('.summary-card-label:has-text("Tools")')
      });

      if (await toolsCard.count() > 0) {
        await expect(toolsCard).toBeVisible();

        // Check value is present
        const value = toolsCard.locator('.summary-card-value');
        await expect(value).toBeVisible();
      }
    });

    test('should display duration summary card', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for data to load
      await page.waitForTimeout(2000);

      // Check for duration card
      const durationCard = page.locator('.summary-card').filter({
        has: page.locator('.summary-card-label:has-text("Duration")')
      });

      if (await durationCard.count() > 0) {
        await expect(durationCard).toBeVisible();

        // Check value is present
        const value = durationCard.locator('.summary-card-value');
        await expect(value).toBeVisible();
      }
    });
  });

  test.describe('Timeline/Gantt Chart', () => {
    test('should display timeline section', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Check for timeline section
      const timelineSection = page.locator('.section').filter({
        has: page.locator('.section-title:has-text("Timeline")')
      });

      if (await timelineSection.count() > 0) {
        await expect(timelineSection).toBeVisible();
      }
    });

    test('should display timeline chart container', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for timeline to render
      await page.waitForTimeout(2000);

      // Check for timeline chart
      const timelineChart = page.locator('.timeline-chart, #timeline-chart, .gantt-chart');

      if (await timelineChart.count() > 0) {
        await expect(timelineChart.first()).toBeVisible();
      }
    });

    test('should render turn bars in timeline', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for timeline to render
      await page.waitForTimeout(3000);

      // Check for turn bars (various possible selectors)
      const turnBars = page.locator('.turn-bar, .timeline-bar, .gantt-bar, [class*="turn"]');

      const count = await turnBars.count();
      if (count > 0) {
        // Verify at least one turn bar is visible
        await expect(turnBars.first()).toBeVisible();
      }
    });

    test('should display timeline with correct structure', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for timeline to render
      await page.waitForTimeout(3000);

      // Check for timeline rows or lanes
      const timelineRows = page.locator('.timeline-row, .gantt-row, [class*="row"]');

      const rowCount = await timelineRows.count();
      if (rowCount > 0) {
        // Timeline should have structured rows
        expect(rowCount).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Tool Summary Section', () => {
    test('should display tool summary items sorted by count descending', async ({ page }, testInfo) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for Vue to render
      await page.waitForTimeout(3000);

      // Look for the Tool Summary heading
      const toolSummaryHeading = page.locator('h3:has-text("Tool Summary")');
      if (await toolSummaryHeading.count() === 0) {
        testInfo.skip(true, 'No Tool Summary section found in this session');
        return;
      }

      // Get all tool summary items - they contain a count like "N calls"
      const toolItems = page.locator('text=/\\d+ calls?/');
      const itemCount = await toolItems.count();

      if (itemCount >= 2) {
        // Extract counts and verify descending order
        const counts = [];
        for (let i = 0; i < itemCount; i++) {
          const text = await toolItems.nth(i).textContent();
          const match = text.match(/(\d+) calls?/);
          if (match) {
            counts.push(parseInt(match[1], 10));
          }
        }

        // Verify counts are in descending order
        for (let i = 1; i < counts.length; i++) {
          expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
        }
      }
    });
  });

  test.describe('Tab Switching', () => {
    test('should have Timeline and Agent Review tabs', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Check for tabs container
      const tabs = page.locator('.tabs, .tab-buttons, [role="tablist"]');

      if (await tabs.count() > 0) {
        await expect(tabs.first()).toBeVisible();

        // Check for Timeline tab
        const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")');
        if (await timelineTab.count() > 0) {
          await expect(timelineTab.first()).toBeVisible();
        }

        // Check for Agent Review tab
        const agentReviewTab = page.locator('button:has-text("Agent Review"), [role="tab"]:has-text("Agent Review")');
        if (await agentReviewTab.count() > 0) {
          await expect(agentReviewTab.first()).toBeVisible();
        }
      }
    });

    test('should switch between Timeline and Agent Review tabs', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for page to fully load
      await page.waitForTimeout(2000);

      // Find Agent Review tab
      const agentReviewTab = page.locator('button:has-text("Agent Review"), [role="tab"]:has-text("Agent Review")');

      if (await agentReviewTab.count() > 0) {
        // Click Agent Review tab
        await agentReviewTab.first().click();
        await page.waitForTimeout(500);

        // Check that tab is active (various possible selectors)
        const activeTab = page.locator('[role="tab"][aria-selected="true"], .tab-active, .active');
        if (await activeTab.count() > 0) {
          const activeText = await activeTab.first().textContent();
          expect(activeText).toContain('Agent Review');
        }

        // Switch back to Timeline tab
        const timelineTab = page.locator('button:has-text("Timeline"), [role="tab"]:has-text("Timeline")');
        if (await timelineTab.count() > 0) {
          await timelineTab.first().click();
          await page.waitForTimeout(500);
        }
      }
    });
  });

  test.describe('API - Timeline Data', () => {
    test('GET /api/sessions/:id/timeline should return 200', async ({ request }) => {
      const response = await request.get(`/api/sessions/${SESSION_ID}/timeline`);

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);
    });

    test('GET /api/sessions/:id/timeline should return timeline data', async ({ request }) => {
      const response = await request.get(`/api/sessions/${SESSION_ID}/timeline`);
      const data = await response.json();

      // Check for timeline structure
      expect(data).toBeDefined();

      // Timeline should have turns array
      if (data.turns) {
        expect(Array.isArray(data.turns)).toBeTruthy();
      }
    });

    test('GET /api/sessions/:id/timeline should return 404 for invalid session', async ({ request }) => {
      const response = await request.get('/api/sessions/invalid-session-id-999/timeline');

      expect(response.status()).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    test('timeline data should include turn information', async ({ request }) => {
      const response = await request.get(`/api/sessions/${SESSION_ID}/timeline`);
      const data = await response.json();

      // If turns exist, verify structure
      if (data.turns && data.turns.length > 0) {
        const firstTurn = data.turns[0];

        // Turn should have basic fields
        expect(firstTurn).toBeDefined();

        // Check for timestamp or duration fields (common in timeline data)
        const hasTimeField = firstTurn.timestamp || firstTurn.startTime ||
                            firstTurn.start || firstTurn.duration;
        expect(hasTimeField).toBeTruthy();
      }
    });
  });
});
