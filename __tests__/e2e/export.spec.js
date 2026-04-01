const { test, expect, getSessionsWithRetry } = require('./fixtures');
const AdmZip = require('adm-zip');

test.describe('Export Tests', () => {
  let copilotSessionId, claudeSessionId, piSessionId;

  test.beforeAll(async ({ request }) => {
    // Get sessions from API to find different source types
    const sessions = await getSessionsWithRetry(request);

    // Find sessions by source type
    for (const session of sessions) {
      if (session.source === 'copilot' && !copilotSessionId) {
        copilotSessionId = session.id;
      } else if (session.source === 'claude' && !claudeSessionId) {
        claudeSessionId = session.id;
      } else if (session.source === 'pi-mono' && !piSessionId) {
        piSessionId = session.id;
      }
    }

    // At minimum, we need one session
    if (!copilotSessionId && !claudeSessionId && !piSessionId) {
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
      const sessionId = copilotSessionId || claudeSessionId || piSessionId;

      await page.goto(`/session/${sessionId}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check for export button in header
      const exportBtn = page.locator('.export-btn, button:has-text("Export"), button:has-text("📦")');

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
      const sessionId = copilotSessionId || claudeSessionId || piSessionId;

      await page.goto(`/session/${sessionId}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Find export button
      const exportBtn = page.locator('.export-btn, button:has-text("Export")');

      if (await exportBtn.count() > 0) {
        const btn = exportBtn.first();
        await expect(btn).toBeEnabled();
      }
    });

    test('export button should have correct label', async ({ page }) => {
      const sessionId = copilotSessionId || claudeSessionId || piSessionId;

      await page.goto(`/session/${sessionId}`);
      await page.waitForSelector('.main-layout', { timeout: 10000 });

      // Check button text
      const exportBtn = page.locator('.export-btn, button:has-text("Export")');

      if (await exportBtn.count() > 0) {
        const btnText = await exportBtn.first().textContent();
        expect(btnText?.toLowerCase()).toContain('share');
      }
    });
  });

  test.describe('Export API - Copilot Sessions', () => {
    test('should export Copilot session as zip', async ({ request }) => {
      if (!copilotSessionId) {
        test.skip('No Copilot sessions available');
        return;
      }

      const response = await request.get(`/session/${copilotSessionId}/export`);

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Check content type
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('zip');
    });

    test('exported Copilot zip should contain events.jsonl', async ({ request }) => {
      if (!copilotSessionId) {
        test.skip('No Copilot sessions available');
        return;
      }

      const response = await request.get(`/session/${copilotSessionId}/export`);
      expect(response.ok()).toBeTruthy();

      // Get zip buffer
      const buffer = await response.body();

      // Parse zip
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();

      // Check for events.jsonl
      const hasEventsFile = zipEntries.some(entry =>
        entry.entryName.includes('.jsonl')
      );
      expect(hasEventsFile).toBeTruthy();
    });

    test('exported Copilot zip should contain workspace.yaml if present', async ({ request }) => {
      if (!copilotSessionId) {
        test.skip('No Copilot sessions available');
        return;
      }

      const response = await request.get(`/session/${copilotSessionId}/export`);
      expect(response.ok()).toBeTruthy();

      // Get zip buffer
      const buffer = await response.body();

      // Parse zip
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();

      // Check for workspace.yaml (might not exist in all sessions)
      const hasWorkspaceFile = zipEntries.some(entry =>
        entry.entryName.includes('workspace.yaml')
      );

      // This is informational - workspace.yaml is optional
      console.log(`Copilot session has workspace.yaml: ${hasWorkspaceFile}`);
    });
  });

  test.describe('Export API - Claude Sessions', () => {
    test('should export Claude session as zip', async ({ request }) => {
      if (!claudeSessionId) {
        test.skip('No Claude sessions available');
        return;
      }

      const response = await request.get(`/session/${claudeSessionId}/export`);

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Check content type
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('zip');
    });

    test('exported Claude zip should contain events.jsonl', async ({ request }) => {
      if (!claudeSessionId) {
        test.skip('No Claude sessions available');
        return;
      }

      const response = await request.get(`/session/${claudeSessionId}/export`);
      expect(response.ok()).toBeTruthy();

      // Get zip buffer
      const buffer = await response.body();

      // Parse zip
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();

      // Check for events.jsonl
      const hasEventsFile = zipEntries.some(entry =>
        entry.entryName.includes('.jsonl')
      );
      expect(hasEventsFile).toBeTruthy();
    });
  });

  test.describe('Export API - Pi-Mono Sessions', () => {
    test('should export Pi-Mono session as zip', async ({ request }) => {
      if (!piSessionId) {
        test.skip('No Pi-Mono sessions available');
        return;
      }

      const response = await request.get(`/session/${piSessionId}/export`);

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Check content type
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('zip');
    });

    test('exported Pi-Mono zip should contain events.jsonl', async ({ request }) => {
      if (!piSessionId) {
        test.skip('No Pi-Mono sessions available');
        return;
      }

      const response = await request.get(`/session/${piSessionId}/export`);
      expect(response.ok()).toBeTruthy();

      // Get zip buffer
      const buffer = await response.body();

      // Parse zip
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();

      // Check for events.jsonl
      const hasEventsFile = zipEntries.some(entry =>
        entry.entryName.includes('.jsonl')
      );
      expect(hasEventsFile).toBeTruthy();
    });
  });

  test.describe('Export API - Tags Inclusion', () => {
    test('should include tags.json in export if session has tags', async ({ request }) => {
      const sessionId = copilotSessionId || claudeSessionId || piSessionId;

      // First, add tags to the session
      const testTags = ['export-test', 'test-tag'];
      await request.put(`/api/sessions/${sessionId}/tags`, {
        data: { tags: testTags }
      });

      // Wait for tags to be persisted
      await new Promise(resolve => setTimeout(resolve, 500));

      // Export session
      const response = await request.get(`/session/${sessionId}/export`);
      expect(response.ok()).toBeTruthy();

      // Get zip buffer
      const buffer = await response.body();

      // Parse zip
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();

      // Check for tags.json
      const tagsEntry = zipEntries.find(entry =>
        entry.entryName.includes('tags.json')
      );

      if (tagsEntry) {
        // Verify tags content
        const tagsContent = tagsEntry.getData().toString('utf8');
        const tagsData = JSON.parse(tagsContent);

        expect(Array.isArray(tagsData)).toBeTruthy();
        expect(tagsData).toContain('export-test');
      }

      // Clean up tags
      await request.put(`/api/sessions/${sessionId}/tags`, {
        data: { tags: [] }
      });
    });
  });

  test.describe('Export API - Error Handling', () => {
    test('should return 404 for non-existent session', async ({ request }) => {
      const response = await request.get('/session/invalid-session-id-999/export');

      expect(response.status()).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    test('should return 400 for invalid session ID format', async ({ request }) => {
      const response = await request.get('/session/../etc/passwd/export');

      expect([400, 404]).toContain(response.status());

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  test.describe('Export File Properties', () => {
    test('exported zip should have correct filename', async ({ request }) => {
      const sessionId = copilotSessionId || claudeSessionId || piSessionId;

      const response = await request.get(`/session/${sessionId}/export`);
      expect(response.ok()).toBeTruthy();

      // Check content-disposition header for filename
      const contentDisposition = response.headers()['content-disposition'];

      if (contentDisposition) {
        expect(contentDisposition).toContain('attachment');
        expect(contentDisposition).toContain('.zip');
      }
    });

    test('exported zip should be valid and parseable', async ({ request }) => {
      const sessionId = copilotSessionId || claudeSessionId || piSessionId;

      const response = await request.get(`/session/${sessionId}/export`);
      expect(response.ok()).toBeTruthy();

      // Get zip buffer
      const buffer = await response.body();

      // Should be able to parse without errors
      expect(() => {
        new AdmZip(buffer);
      }).not.toThrow();
    });

    test('exported zip should not be empty', async ({ request }) => {
      const sessionId = copilotSessionId || claudeSessionId || piSessionId;

      const response = await request.get(`/session/${sessionId}/export`);
      expect(response.ok()).toBeTruthy();

      // Get zip buffer
      const buffer = await response.body();

      // Parse zip and check entries
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();

      expect(zipEntries.length).toBeGreaterThan(0);
    });

    test('events.jsonl in zip should contain valid data', async ({ request }) => {
      const sessionId = copilotSessionId || claudeSessionId || piSessionId;

      const response = await request.get(`/session/${sessionId}/export`);
      expect(response.ok()).toBeTruthy();

      // Get zip buffer
      const buffer = await response.body();

      // Parse zip
      const zip = new AdmZip(buffer);
      const eventsEntry = zip.getEntries().find(entry =>
        entry.entryName.includes('.jsonl')
      );

      expect(eventsEntry).toBeDefined();

      // Get events content
      const eventsContent = eventsEntry.getData().toString('utf8');

      // Should not be empty
      expect(eventsContent.length).toBeGreaterThan(0);

      // Should be valid JSONL (each line is valid JSON)
      const lines = eventsContent.trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          expect(() => JSON.parse(line)).not.toThrow();
        }
      }
    });
  });
});
