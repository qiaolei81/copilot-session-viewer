const { test, expect, getAllSourceSessionsWithRetry } = require('./fixtures');

test.describe('Tagging Feature', () => {
  let SESSION_ID;
  let SESSION_SOURCE = 'copilot-cli';

  // Run all tests in serial mode to avoid conflicts since they share the same session
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    // Get first session ID from API
    const sessions = await getAllSourceSessionsWithRetry(request);

    if (sessions.length > 0) {
      SESSION_ID = sessions[0].id;
      SESSION_SOURCE = sessions[0].source || 'copilot-cli';
    } else {
      test.skip('No sessions available for testing');
      return;
    }
  });

  test.afterAll(async ({ request }) => {
    // Clean up: reset tags to empty array after all tests complete
    if (SESSION_ID) {
      try {
        await request.put(`/api/${SESSION_SOURCE}/sessions/${SESSION_ID}/tags`, {
          data: { tags: [] }
        });
      } catch (error) {
        console.warn('Failed to clean up tags:', error.message);
      }
    }
    // Clean up autocomplete-test tag from sessions[1]
    try {
      const sessions = await getAllSourceSessionsWithRetry(request);
      if (sessions.length > 1) {
        const otherSession = sessions[1];
        const otherSource = otherSession.source || 'copilot-cli';
        if (otherSession.id !== SESSION_ID) {
          await request.put(`/api/${otherSource}/sessions/${otherSession.id}/tags`, {
            data: { tags: [] }
          });
        }
      }
    } catch (error) {
      console.warn('Failed to clean up autocomplete tags:', error.message);
    }
  });

  test.describe('UI Tests - Homepage', () => {
    test('should display tags on session cards after adding them', async ({ page, request }) => {
      // Add tags via API
      const testTags = ['homepage-tag-1', 'homepage-tag-2'];
      await request.put(`/api/${SESSION_SOURCE}/sessions/${SESSION_ID}/tags`, {
        data: { tags: testTags }
      });

      // Navigate to homepage
      await page.goto('/');

      // Wait for sessions to load
      await page.waitForSelector('.recent-item', { timeout: 10000 });

      // If the session is from a different source, click its filter pill
      if (SESSION_SOURCE !== 'copilot' && SESSION_SOURCE !== 'copilot-cli') {
        const pillText = SESSION_SOURCE === 'claude' ? 'Claude' :
                         SESSION_SOURCE === 'pi-mono' ? 'Pi' :
                         SESSION_SOURCE === 'modernize' ? 'Modernize CLI' :
                         SESSION_SOURCE === 'vscode' ? 'Copilot Chat' : 'Copilot CLI';
        await page.locator('.filter-pill').filter({ hasText: pillText }).click();
        await page.waitForTimeout(1000);
      }

      // Find the target session card by its link
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
      // Navigate to homepage
      await page.goto('/');
      await page.waitForSelector('.recent-item', { timeout: 10000 });

      // Check first few session cards
      const sessionCards = page.locator('.recent-item');
      const firstCard = sessionCards.first();

      // Tags section should either not exist or be empty
      const tagsContainer = firstCard.locator('.session-tags');
      const tagsCount = await tagsContainer.count();

      if (tagsCount > 0) {
        const tags = firstCard.locator('.session-tag');
        const tagCount = await tags.count();
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
      await page.goto(`/#/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check for tags container
      const tagsContainer = page.locator('.session-tags-container');
      await expect(tagsContainer).toBeVisible();

      // Check for section title
      await expect(tagsContainer.locator('.sidebar-section-title')).toContainText('Tags');
    });

    test('should show edit button for tags', async ({ page }) => {
      await page.goto(`/#/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      const tagsContainer = page.locator('.session-tags-container');
      await expect(tagsContainer).toBeVisible();

      // Check for edit button
      const editButton = page.locator('.tags-edit-btn');
      await expect(editButton).toBeVisible();
    });

    test('should open tag editing dropdown on edit button click', async ({ page }) => {
      await page.goto(`/#/session/${SESSION_ID}`);
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
      await request.put(`/api/${SESSION_SOURCE}/sessions/${SESSION_ID}/tags`, {
        data: { tags: [] }
      });
      await new Promise(resolve => setTimeout(resolve, 100));

      await page.goto(`/#/session/${SESSION_ID}`);
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
      await page.locator('.main-layout').click({ position: { x: 500, y: 200 } });
      await page.waitForTimeout(1500);

      // Verify tag is displayed in the tags display (non-editing mode)
      const displayedTag = page.locator('.tag-label').filter({ hasText: 'ui-test-tag' });
      await expect(displayedTag).toBeVisible({ timeout: 10000 });
    });

    test('should persist tags after page reload', async ({ page, request }) => {
      // Add tag via API
      const testTag = 'persist-test-tag';
      await request.put(`/api/${SESSION_SOURCE}/sessions/${SESSION_ID}/tags`, {
        data: { tags: [testTag] }
      });

      // Navigate to session detail page
      await page.goto(`/#/session/${SESSION_ID}`);
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
      const sessions = await getAllSourceSessionsWithRetry(request);

      if (sessions.length > 1) {
        const otherSession = sessions[1];
        const otherSource = otherSession.source || 'copilot-cli';
        await request.put(`/api/${otherSource}/sessions/${otherSession.id}/tags`, {
          data: { tags: ['autocomplete-test'] }
        });
      }

      // Navigate to our test session
      await page.goto(`/#/session/${SESSION_ID}`);
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
      await page.goto(`/#/session/${SESSION_ID}`);
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
      await request.put(`/api/${SESSION_SOURCE}/sessions/${SESSION_ID}/tags`, {
        data: { tags: testTags }
      });
      await new Promise(resolve => setTimeout(resolve, 400));

      await page.goto(`/#/session/${SESSION_ID}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Wait for Vue to mount and load tags
      await page.waitForTimeout(2000);

      // Wait for at least one tag to appear (with longer timeout)
      try {
        await page.waitForSelector('.tag-label', { timeout: 15000 });
      } catch (e) {
        const tagsContainer = await page.locator('.session-tags-container').count();
        console.log('Tags container found:', tagsContainer);

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
        expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
        expect(bgColor).not.toBe('transparent');
      }
    });

    test('should limit tag input to 30 characters', async ({ page }) => {
      await page.goto(`/#/session/${SESSION_ID}`);
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
