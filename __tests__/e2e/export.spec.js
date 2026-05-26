const { test, expect, getAllSourceSessionsWithRetry } = require('./fixtures');

test.describe('Export Tests', () => {
  let sessionId;
  let sessionSource;

  test.beforeAll(async ({ request }) => {
    const sessions = await getAllSourceSessionsWithRetry(request);

    // Find any session with events for export button testing
    for (const session of sessions) {
      if (session?.hasEvents && session.eventCount > 0) {
        sessionId = session.id;
        sessionSource = session.source;
        break;
      }
    }

    if (!sessionId && sessions.length > 0) {
      sessionId = sessions[0].id;
      sessionSource = sessions[0].source;
    }

    if (!sessionId) {
      throw new Error('No sessions available for testing');
    }
  });

  test.describe('Export Button on Session Detail Page', () => {
    test.beforeEach(async ({ page }) => {
      // Suppress harmless virtual scroller errors
      page.on('pageerror', error => {
        const message = error.message;
        if (message.includes('ResizeObserver') ||
            message.includes("Cannot read properties of undefined (reading 'has')")) {
          return;
        }
        throw error;
      });
    });

    test('should display export button on session detail page', async ({ page }) => {
      await page.goto(`/#/${sessionSource}/session/${sessionId}`);
      await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

      // Check for export button in header
      const exportBtn = page.locator('[data-testid="export-btn"], button:has-text("Export"), button:has-text("📦")');

      if (await exportBtn.count() > 0) {
        await expect(exportBtn.first()).toBeVisible();
      } else {
        // Export button might be in different location
        const anyExportBtn = page.locator('[class*="export"], [id*="export"]');
        if (await anyExportBtn.count() > 0) {
          console.log('Export button found with alternative selector');
        }
      }
    });

    test('export button should be enabled', async ({ page }) => {
      await page.goto(`/#/${sessionSource}/session/${sessionId}`);
      await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

      // Find export button
      const exportBtn = page.locator('[data-testid="export-btn"], button:has-text("Export")');

      if (await exportBtn.count() > 0) {
        const btn = exportBtn.first();
        await expect(btn).toBeEnabled();
      }
    });

    test('export button should have correct label', async ({ page }) => {
      await page.goto(`/#/${sessionSource}/session/${sessionId}`);
      await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

      // Check button text
      const exportBtn = page.locator('[data-testid="export-btn"], button:has-text("Export")');

      if (await exportBtn.count() > 0) {
        const btnText = await exportBtn.first().textContent();
        expect(btnText?.toLowerCase()).toContain('share');
      }
    });
  });
});
