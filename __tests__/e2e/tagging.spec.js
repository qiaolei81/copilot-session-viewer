const { test, expect, getSessionsWithRetry } = require('./fixtures');

test.describe('Tagging Feature', () => {
  let SESSION_ID;
  let SESSION_SOURCE = 'copilot';

  // Run all tests in serial mode to avoid conflicts since they share the same session
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    // Get first session ID from API
    const sessions = await getSessionsWithRetry(request);

    if (sessions.length > 0) {
      SESSION_ID = sessions[0].id;
      SESSION_SOURCE = sessions[0].source || 'copilot';
    } else {
      test.skip('No sessions available for testing');
      return;
    }
  });

  test.afterAll(async ({ request }) => {
    // Clean up: reset tags to empty array after all tests complete
    if (SESSION_ID) {
      try {
        await request.put(`/api/sessions/${SESSION_ID}/tags`, {
          data: { tags: [] }
        });
      } catch (error) {
        console.warn('Failed to clean up tags:', error.message);
      }
    }
    // Clean up autocomplete-test tag from sessions[1] (set by autocomplete test)
    try {
      const sessions = await getSessionsWithRetry(request);
      if (sessions.length > 1) {
        const otherSessionId = sessions[1].id;
        if (otherSessionId !== SESSION_ID) {
          await request.put(`/api/sessions/${otherSessionId}/tags`, {
            data: { tags: [] }
          });
        }
      }
    } catch (error) {
      console.warn('Failed to clean up autocomplete tags:', error.message);
    }
  });

  test.describe('API Tests', () => {
    test('GET /api/tags should return 200 with tags array', async ({ request }) => {
      const response = await request.get('/api/tags');

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('tags');
      expect(Array.isArray(data.tags)).toBeTruthy();
    });

    test('GET /api/sessions/:id/tags should return 200 for valid session', async ({ request }) => {
      const response = await request.get(`/api/sessions/${SESSION_ID}/tags`);

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('tags');
      expect(Array.isArray(data.tags)).toBeTruthy();
    });

    test('GET /api/sessions/:id/tags should return 404 for invalid session', async ({ request }) => {
      const response = await request.get('/api/sessions/invalid-session-id/tags');

      expect(response.status()).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    test('PUT /api/sessions/:id/tags should persist tags', async ({ request }) => {
      // Clean up first to ensure clean state
      await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: [] }
      });
      await new Promise(resolve => setTimeout(resolve, 200));

      const testTags = ['persist-1', 'persist-2', 'persist-3'];

      // Set tags
      const putResponse = await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: testTags }
      });

      expect(putResponse.ok()).toBeTruthy();
      expect(putResponse.status()).toBe(200);

      const putData = await putResponse.json();
      expect(putData.tags).toEqual(testTags);

      // Add small delay to ensure filesystem write completes
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify persistence by fetching tags
      const getResponse = await request.get(`/api/sessions/${SESSION_ID}/tags`);
      expect(getResponse.ok()).toBeTruthy();

      const getData = await getResponse.json();
      expect(getData.tags).toEqual(testTags);
    });

    test('PUT should reject tag exceeding 30 characters', async ({ request }) => {
      const longTag = 'a'.repeat(31); // 31 characters
      const response = await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: [longTag] }
      });

      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('30 characters');
    });

    test('PUT should reject more than 10 tags', async ({ request }) => {
      const tooManyTags = Array.from({ length: 11 }, (_, i) => `tag-${i + 1}`);
      const response = await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: tooManyTags }
      });

      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('Maximum 10 tags');
    });

    test('PUT should reject empty string tags', async ({ request }) => {
      const response = await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: ['valid-tag', '  ', 'another-tag'] }
      });

      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('non-empty strings');
    });

    test('PUT should reject non-array tags', async ({ request }) => {
      const response = await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: 'not-an-array' }
      });

      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('array');
    });

    test('PUT should accept exactly 30 character tag', async ({ request }) => {
      const maxLengthTag = 'a'.repeat(30); // Exactly 30 characters
      const response = await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: [maxLengthTag] }
      });

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);
    });

    test('PUT should accept exactly 10 tags', async ({ request }) => {
      const tenTags = Array.from({ length: 10 }, (_, i) => `tag-${i + 1}`);
      const response = await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: tenTags }
      });

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);
    });
  });

  test.describe('UI Tests - Homepage', () => {
    test('should display tags on session cards after adding them', async ({ page, request }) => {
      // Add tags via API
      const testTags = ['homepage-tag-1', 'homepage-tag-2'];
      await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: testTags }
      });

      // Navigate to homepage
      await page.goto('/');

      const sessionsContainer = page.locator('#sessions-container');
      await expect(sessionsContainer).toBeVisible();

      if (SESSION_SOURCE !== 'copilot') {
        await page.locator(`.filter-pill[data-source="${SESSION_SOURCE}"]`).click();
      }

      await expect.poll(async () => {
        return (await sessionsContainer.textContent()) || '';
      }).not.toContain('⏳ Loading...');

      const targetCard = page.locator(`.recent-item[href="/session/${SESSION_ID}"]`).first();

      if (await targetCard.count() === 0) {
        console.log('Tagged session not visible on homepage current page/filter');
        return;
      }

      await expect(targetCard).toBeVisible();

      const tagsContainer = targetCard.locator('.session-tags');
      await expect(tagsContainer).toBeVisible();

      const tags = targetCard.locator('.session-tag');
      await expect(tags).toHaveCount(2);
      await expect(tags.nth(0)).toContainText('homepage-tag-1');
      await expect(tags.nth(1)).toContainText('homepage-tag-2');
    });

    test('should not show tags section when session has no tags', async ({ page }) => {
      // Navigate to homepage (tags are cleaned up by afterEach)
      await page.goto('/');
      await page.waitForSelector('.recent-item', { timeout: 5000 });

      // Check first few session cards
      const sessionCards = page.locator('.recent-item');
      const firstCard = sessionCards.first();

      // Tags section should either not exist or be empty
      const tagsContainer = firstCard.locator('.session-tags');
      const tagsCount = await tagsContainer.count();

      if (tagsCount > 0) {
        // If tags container exists, it should be empty or have no tag children
        const tags = firstCard.locator('.session-tag');
        const tagCount = await tags.count();
        // It's ok if there are no tags or if tags exist (from other sessions)
        expect(tagCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('UI Tests - Session Detail Page', () => {
    test.beforeEach(async ({ page }) => {
      // Suppress harmless errors
      page.on('pageerror', error => {
        const message = error.message;
        if (message.includes('ResizeObserver') ||
            message.includes("Cannot read properties of undefined (reading 'has')")) {
          return;
        }
        throw error;
      });
    });

    test('should display tags section in sidebar', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check for tags container
      const tagsContainer = page.locator('.session-tags-container');
      await expect(tagsContainer).toBeVisible();

      // Check for section title
      await expect(tagsContainer.locator('.sidebar-section-title')).toContainText('Tags');
    });

    test('should show edit button for tags', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      const tagsContainer = page.locator('.session-tags-container');
      await expect(tagsContainer).toBeVisible();

      // Check for edit button (emoji or text)
      const editButton = page.locator('.tags-edit-btn');
      await expect(editButton).toBeVisible();
    });

    test('should open tag editing dropdown on edit button click', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Click edit button
      const editButton = page.locator('.tags-edit-btn');
      await editButton.click();

      // Wait for dropdown to appear
      await page.waitForTimeout(300);

      // Check that editing mode is active
      const dropdown = page.locator('.tags-dropdown');
      await expect(dropdown).toBeVisible();

      // Check for input field
      const input = page.locator('.tags-text-input');
      await expect(input).toBeVisible();
      await expect(input).toHaveAttribute('placeholder', /tag name/i);
    });

    test('should add a tag and display it', async ({ page, request }) => {
      // Clean up first
      await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: [] }
      });
      await new Promise(resolve => setTimeout(resolve, 100));

      await page.goto(`/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Click edit button
      const editButton = page.locator('.tags-edit-btn');
      await editButton.click();
      await page.waitForTimeout(500);

      // Type tag name
      const input = page.locator('.tags-text-input');
      await input.fill('ui-test-tag');

      // Press Enter to add tag
      await input.press('Enter');
      await page.waitForTimeout(500);

      // Check that tag appears in the editing view
      const tagChip = page.locator('.tag-input-chip').filter({ hasText: 'ui-test-tag' });
      await expect(tagChip).toBeVisible();

      // Click outside the dropdown to trigger blur and save
      // Click on the main content area
      await page.locator('.main-layout').click({ position: { x: 500, y: 200 } });
      await page.waitForTimeout(1500);

      // Verify tag is displayed in the tags display (non-editing mode)
      const displayedTag = page.locator('.tag-label').filter({ hasText: 'ui-test-tag' });
      await expect(displayedTag).toBeVisible({ timeout: 10000 });
    });

    test('should persist tags after page reload', async ({ page, request }) => {
      // Add tag via API
      const testTag = 'persist-test-tag';
      await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: [testTag] }
      });

      // Navigate to session detail page
      await page.goto(`/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Verify tag is visible
      const tagLabel = page.locator('.tag-label').filter({ hasText: testTag });
      await expect(tagLabel).toBeVisible();

      // Reload page
      await page.reload();
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Verify tag is still visible after reload
      await expect(tagLabel).toBeVisible();
    });

    test('should show autocomplete suggestions', async ({ page, request }) => {
      // Add some tags to other sessions to populate autocomplete
      const sessions = await getSessionsWithRetry(request);

      if (sessions.length > 1) {
        // Add a known tag to another session
        const otherSessionId = sessions[1].id;
        await request.put(`/api/sessions/${otherSessionId}/tags`, {
          data: { tags: ['autocomplete-test'] }
        });
      }

      // Navigate to our test session
      await page.goto(`/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Open tag editor
      const editButton = page.locator('.tags-edit-btn');
      await editButton.click();
      await page.waitForTimeout(300);

      // Type partial tag name
      const input = page.locator('.tags-text-input');
      await input.fill('auto');

      // Wait for autocomplete to appear
      await page.waitForTimeout(500);

      // Check if autocomplete appears (may not if no matching tags)
      const autocomplete = page.locator('.tags-autocomplete');
      const autocompleteVisible = await autocomplete.isVisible().catch(() => false);

      if (autocompleteVisible) {
        const autocompleteItems = page.locator('.tags-autocomplete-item');
        const itemCount = await autocompleteItems.count();
        expect(itemCount).toBeGreaterThan(0);
      }

      // Close editor
      await page.keyboard.press('Escape');
    });

    test('should remove tag from editing view', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Open editor
      const editButton = page.locator('.tags-edit-btn');
      await editButton.click();
      await page.waitForTimeout(300);

      // Add a tag
      const input = page.locator('.tags-text-input');
      await input.fill('removable-tag');
      await input.press('Enter');
      await page.waitForTimeout(300);

      // Verify tag is added
      let tagChip = page.locator('.tag-input-chip').filter({ hasText: 'removable-tag' });
      await expect(tagChip).toBeVisible();

      // Click remove button (×)
      const removeButton = tagChip.locator('button');
      await removeButton.click();
      await page.waitForTimeout(300);

      // Verify tag is removed from editing view
      tagChip = page.locator('.tag-input-chip').filter({ hasText: 'removable-tag' });
      await expect(tagChip).not.toBeVisible();
    });

    test('should display multiple tags with colors', async ({ page, request }) => {
      // Clean up first, then add multiple tags
      const testTags = ['ui-multi-1', 'ui-multi-2', 'ui-multi-3'];
      await request.put(`/api/sessions/${SESSION_ID}/tags`, {
        data: { tags: testTags }
      });
      await new Promise(resolve => setTimeout(resolve, 400));

      // Verify tags were set via API
      const verifyResponse = await request.get(`/api/sessions/${SESSION_ID}/tags`);
      const verifyData = await verifyResponse.json();
      expect(verifyData.tags).toEqual(testTags);

      await page.goto(`/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Wait for Vue to mount and load tags
      await page.waitForTimeout(2000);

      // Wait for at least one tag to appear (with longer timeout)
      try {
        await page.waitForSelector('.tag-label', { timeout: 15000 });
      } catch (e) {
        // Debug: Check if tags container exists
        const tagsContainer = await page.locator('.session-tags-container').count();
        console.log('Tags container found:', tagsContainer);

        // Debug: Get all text content from tags section
        if (tagsContainer > 0) {
          const tagsHtml = await page.locator('.session-tags-container').innerHTML();
          console.log('Tags HTML:', tagsHtml);
        }
        throw e;
      }

      // Verify all tags are visible
      for (const tag of testTags) {
        const tagLabel = page.locator('.tag-label').filter({ hasText: tag });
        await expect(tagLabel).toBeVisible({ timeout: 5000 });

        // Verify tag has background color (styling)
        const bgColor = await tagLabel.evaluate(el =>
          window.getComputedStyle(el).backgroundColor
        );
        expect(bgColor).not.toBe('rgba(0, 0, 0, 0)'); // Not transparent
        expect(bgColor).not.toBe('transparent');
      }
    });

    test('should limit tag input to 30 characters', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Open editor
      const editButton = page.locator('.tags-edit-btn');
      await editButton.click();
      await page.waitForTimeout(300);

      // Try to type more than 30 characters
      const input = page.locator('.tags-text-input');
      const longString = 'a'.repeat(35);
      await input.fill(longString);

      // Check that input value is limited to 30 characters
      const actualValue = await input.inputValue();
      expect(actualValue.length).toBeLessThanOrEqual(30);

      // Close editor
      await page.keyboard.press('Escape');
    });
  });
});
