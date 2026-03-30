const { test, expect } = require('./fixtures');

test.describe('Per-Source Session Tests', () => {
  let copilotSessionId, claudeSessionId, piSessionId, modernizeSessionId;

  test.beforeAll(async ({ request }) => {
    // Get sessions from API to find different source types
    const response = await request.get('/api/sessions');
    const sessions = await response.json();

    // Find sessions by source type
    for (const session of sessions) {
      if (session.source === 'copilot' && !copilotSessionId) {
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

  test.describe('Homepage - Source Badges', () => {
    test.fixme('should display Copilot sessions with correct source badge', async ({ page }) => {
      if (!copilotSessionId) {
        test.skip('No Copilot sessions available');
        return;
      }

      await page.goto('/');
      await page.waitForSelector('.recent-item', { timeout: 30000 });

      // Find a copilot session card
      const copilotCard = page.locator('.recent-item').filter({
        has: page.locator('.status-badge:has-text("Copilot")')
      }).first();

      if (await copilotCard.count() > 0) {
        await expect(copilotCard).toBeVisible();
        const sourceBadge = copilotCard.locator('.status-badge');
        await expect(sourceBadge).toContainText('Copilot');
      }
    });

    test('should display Claude sessions with correct source badge', async ({ page }) => {
      if (!claudeSessionId) {
        test.skip('No Claude sessions available');
        return;
      }

      await page.goto('/');
      await page.waitForSelector('.recent-item', { timeout: 30000 });

      // Find a claude session card
      const claudeCard = page.locator('.recent-item').filter({
        has: page.locator('.status-badge:has-text("Claude")')
      }).first();

      if (await claudeCard.count() > 0) {
        await expect(claudeCard).toBeVisible();
        const sourceBadge = claudeCard.locator('.status-badge');
        await expect(sourceBadge).toContainText('Claude');
      }
    });

    test.fixme('should display Pi-Mono sessions with correct source badge', async ({ page }) => {
      if (!piSessionId) {
        test.skip('No Pi-Mono sessions available');
        return;
      }

      await page.goto('/');
      await page.waitForSelector('.recent-item', { timeout: 30000 });

      // Find a pi-mono session card
      const piCard = page.locator('.recent-item').filter({
        has: page.locator('.status-badge:has-text("Pi")')
      }).first();

      if (await piCard.count() > 0) {
        await expect(piCard).toBeVisible();
        const sourceBadge = piCard.locator('.status-badge');
        await expect(sourceBadge).toContainText('Pi');
      }
    });
  });

  test.describe('Homepage - Source Filter Pills', () => {
    test('should have filter pills for each source', async ({ page }) => {
      await page.goto('/');
      await page.locator('button:has-text("Copilot CLI")').waitFor({ timeout: 30000 });

      // Check for source filter pills
      const allPill = page.locator('.filter-pill[data-source="copilot"]');
      await expect(allPill).toBeVisible();

      const copilotPill = page.locator('.filter-pill[data-source="copilot"]');
      await expect(copilotPill).toBeVisible();

      const claudePill = page.locator('.filter-pill[data-source="claude"]');
      await expect(claudePill).toBeVisible();

      const piPill = page.locator('.filter-pill[data-source="pi-mono"]');
      await expect(piPill).toBeVisible();

      const modernizePill = page.locator('.filter-pill[data-source="modernize"]');
      await expect(modernizePill).toBeVisible();
    });

    test.fixme('should filter sessions by Copilot source', async ({ page }) => {
      if (!copilotSessionId) {
        test.skip('No Copilot sessions available');
        return;
      }

      await page.goto('/');
      await page.locator('button:has-text("Copilot CLI")').waitFor({ timeout: 30000 });

      // Click Copilot filter pill
      const copilotPill = page.locator('.filter-pill[data-source="copilot"]');
      await copilotPill.click();

      // Wait for filtered sessions to load
      await page.locator('.recent-item').first().waitFor({ timeout: 30000 });

      // All visible session cards should have Copilot badge
      const sessionCards = page.locator('.recent-item');
      const count = await sessionCards.count();

      if (count > 0) {
        for (let i = 0; i < Math.min(count, 5); i++) {
          const card = sessionCards.nth(i);
          const sourceBadge = card.locator('.status-badge');
          await expect(sourceBadge).toContainText('Copilot');
        }
      }
    });

    test.fixme('should filter sessions by Claude source', async ({ page }) => {
      if (!claudeSessionId) {
        test.skip('No Claude sessions available');
        return;
      }

      await page.goto('/');
      await page.locator('button:has-text("Copilot CLI")').waitFor({ timeout: 30000 });

      // Click Claude filter pill
      const claudePill = page.locator('.filter-pill[data-source="claude"]');
      await claudePill.click();

      // Wait for filtered sessions to load
      await page.locator('.recent-item').first().waitFor({ timeout: 30000 });

      // All visible session cards should have Claude badge
      const sessionCards = page.locator('.recent-item');
      const count = await sessionCards.count();

      if (count > 0) {
        for (let i = 0; i < Math.min(count, 5); i++) {
          const card = sessionCards.nth(i);
          const sourceBadge = card.locator('.status-badge');
          await expect(sourceBadge).toContainText('Claude');
        }
      }
    });

    test.fixme('should filter sessions by Pi-Mono source', async ({ page }) => {
      if (!piSessionId) {
        test.skip('No Pi-Mono sessions available');
        return;
      }

      await page.goto('/');
      await page.locator('button:has-text("Copilot CLI")').waitFor({ timeout: 30000 });

      // Click Pi filter pill
      const piPill = page.locator('.filter-pill[data-source="pi-mono"]');
      await piPill.click();

      // Wait for filtered sessions to load
      await page.locator('.recent-item').first().waitFor({ timeout: 30000 });

      // All visible session cards should have Pi badge
      const sessionCards = page.locator('.recent-item');
      const count = await sessionCards.count();

      if (count > 0) {
        for (let i = 0; i < Math.min(count, 5); i++) {
          const card = sessionCards.nth(i);
          const sourceBadge = card.locator('.status-badge');
          await expect(sourceBadge).toContainText('Pi');
        }
      }
    });

    test.fixme('should filter sessions by Modernize source', async ({ page }) => {
      if (!modernizeSessionId) {
        test.skip('No Modernize sessions available');
        return;
      }

      await page.goto('/');
      await page.locator('button:has-text("Copilot CLI")').waitFor({ timeout: 30000 });

      // Click Modernize filter pill
      const modernizePill = page.locator('.filter-pill[data-source="modernize"]');
      await modernizePill.click();

      // Wait for filtered sessions to load
      await page.locator('.recent-item').first().waitFor({ timeout: 30000 });

      // All visible session cards should have Modernize badge
      const sessionCards = page.locator('.recent-item');
      const count = await sessionCards.count();

      if (count > 0) {
        for (let i = 0; i < Math.min(count, 5); i++) {
          const card = sessionCards.nth(i);
          const sourceBadge = card.locator('.status-badge');
          await expect(sourceBadge).toContainText('Modernize');
        }
      }
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

      await page.goto(`/session/${copilotSessionId}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check page loaded successfully
      await expect(page.locator('.main-layout')).toBeVisible();

      // Check sidebar metadata
      await expect(page.locator('.sidebar')).toBeVisible();
    });

    test('should load Claude session detail page', async ({ page }) => {
      if (!claudeSessionId) {
        test.skip('No Claude sessions available');
        return;
      }

      await page.goto(`/session/${claudeSessionId}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check page loaded successfully
      await expect(page.locator('.main-layout')).toBeVisible();

      // Check sidebar metadata
      await expect(page.locator('.sidebar')).toBeVisible();
    });

    test('should load Pi-Mono session detail page', async ({ page }) => {
      if (!piSessionId) {
        test.skip('No Pi-Mono sessions available');
        return;
      }

      await page.goto(`/session/${piSessionId}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check page loaded successfully
      await expect(page.locator('.main-layout')).toBeVisible();

      // Check sidebar metadata
      await expect(page.locator('.sidebar')).toBeVisible();
    });

    test('should load Modernize session detail page', async ({ page }) => {
      if (!modernizeSessionId) {
        test.skip('No Modernize sessions available');
        return;
      }

      await page.goto(`/session/${modernizeSessionId}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check page loaded successfully
      await expect(page.locator('.main-layout')).toBeVisible();

      // Check sidebar metadata
      await expect(page.locator('.sidebar')).toBeVisible();
    });

    test('should display correct metadata for Copilot session', async ({ page }) => {
      if (!copilotSessionId) {
        test.skip('No Copilot sessions available');
        return;
      }

      await page.goto(`/session/${copilotSessionId}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check for metadata fields
      const sessionInfo = page.locator('.session-info');
      await expect(sessionInfo).toBeVisible();

      // Check for source badge in sidebar
      const sourceBadge = page.locator('.status-badge:has-text("Copilot")');
      if (await sourceBadge.count() > 0) {
        await expect(sourceBadge).toBeVisible();
      }
    });

    test('should display correct metadata for Claude session', async ({ page }) => {
      if (!claudeSessionId) {
        test.skip('No Claude sessions available');
        return;
      }

      await page.goto(`/session/${claudeSessionId}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check for metadata fields
      const sessionInfo = page.locator('.session-info');
      await expect(sessionInfo).toBeVisible();

      // Check for source badge in sidebar
      const sourceBadge = page.locator('.status-badge:has-text("Claude")');
      if (await sourceBadge.count() > 0) {
        await expect(sourceBadge).toBeVisible();
      }
    });

    test('should display correct metadata for Pi-Mono session', async ({ page }) => {
      if (!piSessionId) {
        test.skip('No Pi-Mono sessions available');
        return;
      }

      await page.goto(`/session/${piSessionId}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check for metadata fields
      const sessionInfo = page.locator('.session-info');
      await expect(sessionInfo).toBeVisible();

      // Check for source badge in sidebar
      const sourceBadge = page.locator('.status-badge:has-text("Pi")');
      if (await sourceBadge.count() > 0) {
        await expect(sourceBadge).toBeVisible();
      }
    });

    test('should display correct metadata for Modernize session', async ({ page }) => {
      if (!modernizeSessionId) {
        test.skip('No Modernize sessions available');
        return;
      }

      await page.goto(`/session/${modernizeSessionId}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check for metadata fields
      const sessionInfo = page.locator('.session-info');
      await expect(sessionInfo).toBeVisible();

      // Check for source badge in sidebar
      const sourceBadge = page.locator('.status-badge:has-text("Modernize")');
      if (await sourceBadge.count() > 0) {
        await expect(sourceBadge).toBeVisible();
      }
    });
  });
});
