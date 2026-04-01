/**
 * E2E XSS Security Tests
 * Tests XSS prevention in markdown rendering using Playwright
 * These tests verify that malicious content in session data is properly sanitized when rendered
 */

const { test, expect, getSessionsWithRetry } = require('./fixtures');

// Helper to create mock events with proper structure
function createMockEvent(message, type = 'user.message', index = 0) {
  return {
    type,
    timestamp: new Date().toISOString(),
    uuid: `test-uuid-${index}`,
    sessionId: 'test-session',
    _fileIndex: index,
    data: {
      message
    }
  };
}

async function fetchSessionId(request) {
  const sessions = await getSessionsWithRetry(request);
  const sessionId = sessions.find(session => typeof session?.id === 'string' && session.id.trim())?.id;

  if (!sessionId) {
    throw new Error('No valid session ID available from /api/sessions');
  }

  return sessionId;
}

test.describe('XSS Prevention in Session Viewer', () => {
  test('should sanitize javascript: protocol in rendered links', async ({ page, request }) => {
    // Create a mock session with malicious markdown
    await page.route('**/api/sessions/*/events', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          createMockEvent('[Click me](javascript:alert("XSS"))', 'user.message', 0)
        ])
      });
    });

    // Get a valid session ID
    const sessionId = await fetchSessionId(request);

    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.event-content', { timeout: 10000 });

    // Check that javascript: protocol is not in any link href
    const links = await page.locator('a[href]').all();
    for (const link of links) {
      const href = await link.getAttribute('href');
      expect(href).not.toMatch(/^javascript:/i);
    }
  });

  test('should remove script tags from rendered content', async ({ page, request }) => {
    await page.route('**/api/sessions/*/events', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          createMockEvent('Test <script>alert("XSS")</script> content', 'user.message', 0)
        ])
      });
    });

    const sessionId = await fetchSessionId(request);
    
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.event-content', { timeout: 10000 });

    // Verify no script tags exist within the event content
    const eventContent = await page.locator('.event-content').first();
    const scriptTagsInContent = await eventContent.locator('script').count();
    expect(scriptTagsInContent).toBe(0);

    // Verify the malicious content is sanitized
    const content = await eventContent.textContent();
    expect(content).not.toContain('alert("XSS")');
    expect(content).toContain('Test'); // Safe content should remain
    expect(content).toContain('content');
  });

  test('should remove onclick handlers from rendered elements', async ({ page, request }) => {
    await page.route('**/api/sessions/*/events', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          createMockEvent('<a href="#" onclick="alert(1)">Click</a>', 'user.message', 0)
        ])
      });
    });

    const sessionId = await fetchSessionId(request);
    
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.event-content', { timeout: 10000 });

    // Check that no onclick handlers exist
    const linksWithOnclick = await page.locator('a[onclick]').count();
    expect(linksWithOnclick).toBe(0);
  });

  test('should preserve safe markdown features', async ({ page, request }) => {
    await page.route('**/api/sessions/*/events', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          createMockEvent('**Bold** and *italic* and [safe link](https://example.com)', 'assistant.message', 0)
        ])
      });
    });

    const sessionId = await fetchSessionId(request);
    
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.event-content', { timeout: 10000 });

    // Verify safe markdown is rendered correctly
    const bold = await page.locator('strong').count();
    const italic = await page.locator('em').count();
    const links = await page.locator('a[href="https://example.com"]').count();

    expect(bold).toBeGreaterThan(0);
    expect(italic).toBeGreaterThan(0);
    expect(links).toBeGreaterThan(0);
  });

  test('should handle empty/null content safely', async ({ page, request }) => {
    await page.route('**/api/sessions/*/events', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          createMockEvent('', 'user.message', 0),
          createMockEvent('', 'assistant.message', 1)
        ])
      });
    });

    const sessionId = await fetchSessionId(request);
    
    await page.goto(`/session/${sessionId}`);
    
    // Should load without errors
    await page.waitForSelector('.main-layout', { timeout: 10000 });
    const errors = await page.locator('.error-message').count();
    expect(errors).toBe(0);
  });

  test('DOMPurify should be loaded on session pages', async ({ page, request }) => {
    const sessionId = await fetchSessionId(request);
    
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.main-layout', { timeout: 10000 });

    // Check that DOMPurify is available in the global scope
    const isDOMPurifyLoaded = await page.evaluate(() => {
      return typeof window.DOMPurify !== 'undefined' && typeof window.DOMPurify.sanitize === 'function';
    });

    expect(isDOMPurifyLoaded).toBe(true);
  });

  test('should sanitize data: URIs in links', async ({ page, request }) => {
    await page.route('**/api/sessions/*/events', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          createMockEvent('[Click](data:text/html,<script>alert("XSS")</script>)', 'user.message', 0)
        ])
      });
    });

    const sessionId = await fetchSessionId(request);
    
    await page.goto(`/session/${sessionId}`);
    await page.waitForSelector('.event-content', { timeout: 10000 });

    // Check that data: URIs are not in any link href
    const links = await page.locator('a[href]').all();
    for (const link of links) {
      const href = await link.getAttribute('href');
      expect(href).not.toMatch(/^data:/i);
    }
  });
});
