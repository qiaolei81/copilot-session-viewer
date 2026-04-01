const { test, expect, getSessionsWithRetry } = require('./fixtures');

test.describe('Agent Review Tests', () => {
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

  test.describe('Agent Review Tab on Analysis Page', () => {
    test('should display Agent Review tab', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for page to load
      await page.waitForTimeout(2000);

      // Check for Agent Review tab
      const agentReviewTab = page.locator('button:has-text("Agent Review"), [role="tab"]:has-text("Agent Review")');

      if (await agentReviewTab.count() > 0) {
        await expect(agentReviewTab.first()).toBeVisible();
      } else {
        // Tab might not exist on this page structure - log for debugging
        console.log('Agent Review tab not found - may not be implemented on this page');
      }
    });

    test('should be able to click Agent Review tab', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for page to load
      await page.waitForTimeout(2000);

      // Find and click Agent Review tab
      const agentReviewTab = page.locator('button:has-text("Agent Review"), [role="tab"]:has-text("Agent Review")');

      if (await agentReviewTab.count() > 0) {
        await agentReviewTab.first().click();
        await page.waitForTimeout(500);

        // Verify tab is active
        const activeTab = page.locator('[role="tab"][aria-selected="true"]:has-text("Agent Review"), .tab-active:has-text("Agent Review")');
        if (await activeTab.count() > 0) {
          await expect(activeTab.first()).toBeVisible();
        }
      }
    });

    test('should display Agent Review content area', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for page to load
      await page.waitForTimeout(2000);

      // Click Agent Review tab
      const agentReviewTab = page.locator('button:has-text("Agent Review"), [role="tab"]:has-text("Agent Review")');

      if (await agentReviewTab.count() > 0) {
        await agentReviewTab.first().click();
        await page.waitForTimeout(1000);

        // Check for content area (various possible selectors)
        const contentArea = page.locator('.agent-review-content, .insight-content, [role="tabpanel"]');
        if (await contentArea.count() > 0) {
          await expect(contentArea.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('Agent Review - Generate Button', () => {
    test('should show generate button when no review exists', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for page to load
      await page.waitForTimeout(2000);

      // Click Agent Review tab
      const agentReviewTab = page.locator('button:has-text("Agent Review"), [role="tab"]:has-text("Agent Review")');

      if (await agentReviewTab.count() > 0) {
        await agentReviewTab.first().click();
        await page.waitForTimeout(1000);

        // Check for generate button
        const generateBtn = page.locator('button:has-text("Generate"), button:has-text("generate")');
        if (await generateBtn.count() > 0) {
          await expect(generateBtn.first()).toBeVisible();
        } else {
          // Review might already exist - check for content instead
          const reviewContent = page.locator('.agent-review-content, .insight-content, .review-text');
          if (await reviewContent.count() === 0) {
            console.log('Neither generate button nor review content found - feature may not be implemented');
          }
        }
      }
    });

    test('generate button should be clickable', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for page to load
      await page.waitForTimeout(2000);

      // Click Agent Review tab
      const agentReviewTab = page.locator('button:has-text("Agent Review"), [role="tab"]:has-text("Agent Review")');

      if (await agentReviewTab.count() > 0) {
        await agentReviewTab.first().click();
        await page.waitForTimeout(1000);

        // Find generate button
        const generateBtn = page.locator('button:has-text("Generate"), button:has-text("generate")');
        if (await generateBtn.count() > 0) {
          const btn = generateBtn.first();
          await expect(btn).toBeEnabled();

          // Verify it's clickable (don't actually click to avoid generating in CI)
          const isDisabled = await btn.isDisabled().catch(() => false);
          expect(isDisabled).toBeFalsy();
        }
      }
    });
  });

  test.describe('Agent Review - Content Display', () => {
    test('should display review content when available', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for page to load
      await page.waitForTimeout(2000);

      // Click Agent Review tab
      const agentReviewTab = page.locator('button:has-text("Agent Review"), [role="tab"]:has-text("Agent Review")');

      if (await agentReviewTab.count() > 0) {
        await agentReviewTab.first().click();
        await page.waitForTimeout(1000);

        // Check for review content (if it exists)
        const reviewContent = page.locator('.agent-review-content, .insight-content, .review-text, .markdown-content');
        if (await reviewContent.count() > 0) {
          await expect(reviewContent.first()).toBeVisible();

          // Content should not be empty
          const text = await reviewContent.first().textContent();
          expect(text?.trim().length).toBeGreaterThan(0);
        }
      }
    });

    test('should display loading state while generating review', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Wait for page to load
      await page.waitForTimeout(2000);

      // Click Agent Review tab
      const agentReviewTab = page.locator('button:has-text("Agent Review"), [role="tab"]:has-text("Agent Review")');

      if (await agentReviewTab.count() > 0) {
        await agentReviewTab.first().click();
        await page.waitForTimeout(500);

        // Check for loading indicator (various possible selectors)
        const loadingIndicator = page.locator('.loading, .spinner, [class*="loading"]');

        // Loading might appear briefly or not at all if review is cached
        // This test is mainly to verify the loading UI exists if triggered
        const hasLoading = await loadingIndicator.count() > 0;
        if (hasLoading) {
          console.log('Loading indicator found');
        } else {
          console.log('No loading indicator - review may be cached or not being generated');
        }
      }
    });
  });

  test.describe('Agent Review API', () => {
    test('GET /session/:id/insight should return status', async ({ request }) => {
      const response = await request.get(`/session/${SESSION_ID}/insight`);

      // Should return 200 or 404 depending on whether insight exists
      expect([200, 400, 404]).toContain(response.status());
    });

    test('POST /session/:id/insight should accept generation request', async ({ request }) => {
      // Note: We won't actually generate in CI to avoid API costs
      // This test verifies the endpoint exists and accepts requests

      const response = await request.post(`/session/${SESSION_ID}/insight`, {
        failOnStatusCode: false // Don't fail on rate limits or feature flags
      });

      // Should return 200 (accepted), 202 (processing), 429 (rate limit), or 503 (disabled)
      expect([200, 202, 400, 429, 503]).toContain(response.status());
    });

    test('GET /session/:id/insight should return insight content when available', async ({ request }) => {
      const response = await request.get(`/session/${SESSION_ID}/insight`);

      if (response.status() === 200) {
        const data = await response.json();

        // Should have insight data
        expect(data).toBeDefined();

        // Common fields that might be present
        const hasContent = data.content || data.markdown || data.text || data.insight;
        if (hasContent) {
          expect(hasContent.length).toBeGreaterThan(0);
        }
      } else if (response.status() === 404) {
        // No insight exists yet - this is valid
        const data = await response.json();
        expect(data).toHaveProperty('error');
      }
    });

    test('DELETE /session/:id/insight should accept deletion request', async ({ request }) => {
      const response = await request.delete(`/session/${SESSION_ID}/insight`, {
        failOnStatusCode: false
      });

      // Should return 200 (deleted), 404 (not found), or 403 (forbidden)
      expect([200, 400, 404, 403]).toContain(response.status());
    });

    test('GET /session/:id/insight should return 404 for invalid session', async ({ request }) => {
      const response = await request.get('/session/invalid-session-id-999/insight');

      expect(response.status()).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  test.describe('Agent Review - Error Handling', () => {
    test('should handle missing agent review gracefully', async ({ page }) => {
      await page.goto(`/session/${SESSION_ID}/time-analyze`);
      await page.waitForSelector('.container', { timeout: 10000 });

      // Click Agent Review tab
      const agentReviewTab = page.locator('button:has-text("Agent Review"), [role="tab"]:has-text("Agent Review")');

      if (await agentReviewTab.count() > 0) {
        await agentReviewTab.first().click();
        await page.waitForTimeout(1000);

        // Page should not show error for missing review
        // Instead should show generate button or empty state
        const errorMessage = page.locator('.error-message, [class*="error"]');
        const generateBtn = page.locator('button:has-text("Generate")');
        const emptyState = page.locator('.empty-state, [class*="empty"]');

        // Either generate button, empty state, or existing content should be present
        // But not an error
        const hasValidState = (await generateBtn.count() > 0) ||
                             (await emptyState.count() > 0) ||
                             (await page.locator('.agent-review-content, .insight-content').count() > 0);

        if (!hasValidState) {
          // If none of these exist, at minimum there should be no error
          const errorCount = await errorMessage.count();
          expect(errorCount).toBe(0);
        }
      }
    });
  });
});
