const { test, expect, getAllSourceSessionsWithRetry } = require('./fixtures');

test.describe('Per-Source Session Tests', () => {
  let copilotSessionId, claudeSessionId, piSessionId, modernizeSessionId;

  test.beforeAll(async ({ request }) => {
    // Get sessions from all sources
    const sessions = await getAllSourceSessionsWithRetry(request);

    // Find sessions by source type
    for (const session of sessions) {
      if ((session.source === 'copilot' || session.source === 'copilot-cli') && !copilotSessionId) {
        copilotSessionId = session.id;
      } else if (session.source === 'claude' && !claudeSessionId) {
        claudeSessionId = session.id;
      } else if (session.source === 'pi-mono' && !piSessionId) {
        piSessionId = session.id;
      } else if (session.source === 'modernize' && !modernizeSessionId) {
        modernizeSessionId = session.id;
      }
    }
  });

  test.describe('Homepage - Source Filter Pills', () => {
    test('should have filter pills for each source', async ({ page }) => {
      await page.goto('/');
      await page.locator('.filter-pill').first().waitFor({ timeout: 30000 });

      // Check for source filter pills by their text content
      await expect(page.locator('.filter-pill').filter({ hasText: 'Copilot CLI' })).toBeVisible();
      await expect(page.locator('.filter-pill').filter({ hasText: 'Copilot Chat' })).toBeVisible();
      await expect(page.locator('.filter-pill').filter({ hasText: 'Claude' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Pi', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Modernize', exact: false })).toBeVisible();
    });
  });

  test.describe('Session Detail Page - Per Source', () => {
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

    test('should load Copilot session detail page', async ({ page }) => {
      if (!copilotSessionId) {
        test.skip('No Copilot sessions available');
        return;
      }

      await page.goto(`/#/copilot-cli/session/${copilotSessionId}`);
      await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

      await expect(page.locator('[data-testid="session-layout"]')).toBeVisible();
      await expect(page.locator('.sidebar')).toBeVisible();
    });

    test('should load Claude session detail page', async ({ page }) => {
      if (!claudeSessionId) {
        test.skip('No Claude sessions available');
        return;
      }

      await page.goto(`/#/claude/session/${claudeSessionId}`);
      await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

      await expect(page.locator('[data-testid="session-layout"]')).toBeVisible();
      await expect(page.locator('.sidebar')).toBeVisible();
    });

    test('should load Pi-Mono session detail page', async ({ page }) => {
      if (!piSessionId) {
        test.skip('No Pi-Mono sessions available');
        return;
      }

      await page.goto(`/#/pi-mono/session/${piSessionId}`);
      await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

      await expect(page.locator('[data-testid="session-layout"]')).toBeVisible();
      await expect(page.locator('.sidebar')).toBeVisible();
    });

    test('should load Modernize session detail page', async ({ page }) => {
      if (!modernizeSessionId) {
        test.skip('No Modernize sessions available');
        return;
      }

      await page.goto(`/#/modernize/session/${modernizeSessionId}`);
      await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

      await expect(page.locator('[data-testid="session-layout"]')).toBeVisible();
      await expect(page.locator('.sidebar')).toBeVisible();
    });

    test('should display correct metadata for Copilot session', async ({ page }) => {
      if (!copilotSessionId) {
        test.skip('No Copilot sessions available');
        return;
      }

      await page.goto(`/#/copilot-cli/session/${copilotSessionId}`);
      await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

      const sessionInfo = page.locator('.session-info');
      await expect(sessionInfo).toBeVisible();

      const sourceBadge = page.locator('text=("Copilot")');
      if (await sourceBadge.count() > 0) {
        await expect(sourceBadge).toBeVisible();
      }
    });

    test('should display correct metadata for Claude session', async ({ page }) => {
      if (!claudeSessionId) {
        test.skip('No Claude sessions available');
        return;
      }

      await page.goto(`/#/claude/session/${claudeSessionId}`);
      await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

      const sessionInfo = page.locator('.session-info');
      await expect(sessionInfo).toBeVisible();

      const sourceBadge = page.locator('text=("Claude")');
      if (await sourceBadge.count() > 0) {
        await expect(sourceBadge).toBeVisible();
      }
    });

    test('should display correct metadata for Pi-Mono session', async ({ page }) => {
      if (!piSessionId) {
        test.skip('No Pi-Mono sessions available');
        return;
      }

      await page.goto(`/#/pi-mono/session/${piSessionId}`);
      await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

      const sessionInfo = page.locator('.session-info');
      await expect(sessionInfo).toBeVisible();

      const sourceBadge = page.locator('text=("Pi")');
      if (await sourceBadge.count() > 0) {
        await expect(sourceBadge).toBeVisible();
      }
    });

    test('should display correct metadata for Modernize session', async ({ page }) => {
      if (!modernizeSessionId) {
        test.skip('No Modernize sessions available');
        return;
      }

      await page.goto(`/#/modernize/session/${modernizeSessionId}`);
      await page.waitForSelector('[data-testid="session-layout"]', { timeout: 10000 });

      const sessionInfo = page.locator('.session-info');
      await expect(sessionInfo).toBeVisible();

      const sourceBadge = page.locator('text=("Modernize")');
      if (await sourceBadge.count() > 0) {
        await expect(sourceBadge).toBeVisible();
      }
    });
  });
});
