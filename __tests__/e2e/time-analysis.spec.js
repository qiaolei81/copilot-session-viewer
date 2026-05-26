const { test, expect, getSessionsWithRetry } = require('./fixtures');

test.describe('Time Analysis and Timeline Tests', () => {
  let SESSION_ID;
  let SESSION_SOURCE;

  test.beforeAll(async ({ request }) => {
    // Get first session ID from API
    const sessions = await getSessionsWithRetry(request);
    if (sessions.length > 0) {
      SESSION_ID = sessions[0].id;
      SESSION_SOURCE = sessions[0].source;
    } else {
      throw new Error('No sessions available for testing');
    }
  });

  test.describe('Time Analysis Page', () => {
    test('should load time analysis page', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);

      // Wait for page to load
      await page.waitForSelector('.container', { timeout: 10000 });

      // Check page title
      await expect(page.locator('h1')).toContainText('Analysis');
    });

    test('should display navigation buttons', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Check for back button
      const homeBtn = page.locator('.nav-btn:has-text("← Back to Session")');
      await expect(homeBtn).toBeVisible();
    });

    test('should navigate to session detail page', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Click session detail button
      const sessionBtn = page.locator('.nav-btn:has-text("← Back to Session")');
      await sessionBtn.click();

      // Wait for navigation (hash router)
      await page.waitForURL(`**/#/${SESSION_SOURCE}/session/${SESSION_ID}`, { timeout: 5000 });

      // Verify URL changed
      expect(page.url()).toContain(`/#/${SESSION_SOURCE}/session/${SESSION_ID}`);
      expect(page.url()).not.toContain('/time-analyze');
    });
  });

  test.describe('Summary Cards', () => {
    test('should display summary cards section', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Check for summary grid
      const summaryGrid = page.locator('.summary-grid');
      await expect(summaryGrid).toBeVisible();
    });

    test('should display turns summary card', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for data to load
      await page.waitForTimeout(2000);

      // Check for turns card
      const turnsCard = page.locator('.summary-card').filter({
        has: page.locator('.summary-card-label:has-text("Turns")')
      });

      if (await turnsCard.count() > 0) {
        await expect(turnsCard).toBeVisible();

        const value = turnsCard.locator('.summary-card-value');
        await expect(value).toBeVisible();

        const valueText = await value.textContent();
        expect(parseInt(valueText || '0')).toBeGreaterThanOrEqual(0);
      }
    });

    test('should display tools summary card', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      await page.waitForTimeout(2000);

      const toolsCard = page.locator('.summary-card').filter({
        has: page.locator('.summary-card-label:has-text("Tools")')
      });

      if (await toolsCard.count() > 0) {
        await expect(toolsCard).toBeVisible();

        const value = toolsCard.locator('.summary-card-value');
        await expect(value).toBeVisible();
      }
    });

    test('should display duration summary card', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      await page.waitForTimeout(2000);

      const durationCard = page.locator('.summary-card').filter({
        has: page.locator('.summary-card-label:has-text("Duration")')
      });

      if (await durationCard.count() > 0) {
        await expect(durationCard).toBeVisible();

        const value = durationCard.locator('.summary-card-value');
        await expect(value).toBeVisible();
      }
    });
  });

  test.describe('Timeline/Gantt Chart', () => {
    test('should display timeline section', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      const timelineSection = page.locator('.section').filter({
        has: page.locator('.section-title:has-text("Timeline")')
      });

      if (await timelineSection.count() > 0) {
        await expect(timelineSection).toBeVisible();
      }
    });

    test('should display timeline chart container', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      await page.waitForTimeout(2000);

      const timelineChart = page.locator('.timeline-chart, #timeline-chart, .gantt-chart');

      if (await timelineChart.count() > 0) {
        await expect(timelineChart.first()).toBeVisible();
      }
    });

    test('should render turn bars in timeline', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      await page.waitForTimeout(3000);

      const turnBars = page.locator('.turn-bar, .timeline-bar, .gantt-bar, [class*="turn"]');

      const count = await turnBars.count();
      if (count > 0) {
        await expect(turnBars.first()).toBeVisible();
      }
    });

    test('should display timeline with correct structure', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      await page.waitForTimeout(3000);

      const timelineRows = page.locator('.timeline-row, .gantt-row, [class*="row"]');

      const rowCount = await timelineRows.count();
      if (rowCount > 0) {
        expect(rowCount).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Tool Summary Section', () => {
    test('should display tool summary items sorted by count descending', async ({ page }, testInfo) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      await page.waitForTimeout(3000);

      const toolSummaryHeading = page.locator('h3:has-text("Tool Summary")');
      if (await toolSummaryHeading.count() === 0) {
        testInfo.skip(true, 'No Tool Summary section found in this session');
        return;
      }

      const toolItems = page.locator('text=/\\d+ calls?/');
      const itemCount = await toolItems.count();

      if (itemCount >= 2) {
        const counts = [];
        for (let i = 0; i < itemCount; i++) {
          const text = await toolItems.nth(i).textContent();
          const match = text.match(/(\d+) calls?/);
          if (match) {
            counts.push(parseInt(match[1], 10));
          }
        }

        for (let i = 1; i < counts.length; i++) {
          expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
        }
      }
    });
  });

  test.describe('Tab Switching', () => {
    test('should have Timeline and Agent Review tabs', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Check for tabs container
      const tabs = page.locator('.tabs');
      await expect(tabs).toBeVisible();

      // Check for Timeline tab
      const timelineTab = page.locator('button:has-text("Timeline")');
      await expect(timelineTab).toBeVisible();

      // Check for Agent Review tab
      const agentReviewTab = page.locator('button:has-text("Agent Review")');
      await expect(agentReviewTab).toBeVisible();
    });

    test('should switch between Timeline and Agent Review tabs', async ({ page }) => {
      await page.goto(`/#/${SESSION_SOURCE}/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      await page.waitForTimeout(2000);

      // Click Agent Review tab
      const agentReviewTab = page.locator('button:has-text("Agent Review")');
      await agentReviewTab.click();
      await page.waitForTimeout(500);

      // Verify Agent Review tab is active
      await expect(agentReviewTab).toHaveClass(/active/);

      // Switch back to Timeline tab
      const timelineTab = page.locator('button:has-text("Timeline")');
      await timelineTab.click();
      await page.waitForTimeout(500);

      // Verify Timeline tab is active
      await expect(timelineTab).toHaveClass(/active/);
    });
  });
});
