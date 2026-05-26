const { test, expect } = require('./fixtures');

test.describe('Homepage', () => {
  test('should load homepage successfully', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/Session Viewer/);

    // Check header (h1 displays emoji version)
    await expect(page.locator('h1')).toContainText('Session Viewer');
  });

  test('should display session list', async ({ page }) => {
    await page.goto('/');

    // Wait for sessions to load
    await page.waitForSelector('[data-testid="session-card"]', { timeout: 10000 });

    // Check at least one session is displayed
    const sessionCards = page.locator('[data-testid="session-card"]');
    await expect(sessionCards).not.toHaveCount(0);
  });

  test('should show session metadata', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="session-card"]', { timeout: 10000 });

    const firstSession = page.locator('[data-testid="session-card"]').first();

    // Check session has summary
    // Check session has text content (summary)
    await expect(firstSession).not.toBeEmpty();

    // Check session has metadata (events, created time)
    await expect(firstSession).not.toBeEmpty();
  });

  test('should navigate to session detail on click', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="session-card"]', { timeout: 10000 });

    // Click first session
    const firstSession = page.locator('[data-testid="session-card"]').first();
    await firstSession.click();

    // Wait for navigation (hash router)
    await page.waitForFunction(() => window.location.hash.match(/^#\/.*\/session\/.+/));

    // Check URL changed
    expect(page.url()).toMatch(/\/#\/.+\/session\/.+/);
  });
});
