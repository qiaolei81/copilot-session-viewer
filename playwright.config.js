import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const FIXTURES = path.join(__dirname, '__tests__', 'fixtures', 'sessions');

// E2E uses sanitized fixture sessions by default — never the developer's real
// session directories. Override with env vars if you need to point a single
// run at real data (e.g. for debugging).
const FIXTURE_ENV = {
  COPILOT_SESSION_DIR: process.env.COPILOT_SESSION_DIR || path.join(FIXTURES, 'copilot-cli'),
  CLAUDE_SESSION_DIR: process.env.CLAUDE_SESSION_DIR || path.join(FIXTURES, 'claude'),
  PI_MONO_SESSION_DIR: process.env.PI_MONO_SESSION_DIR || path.join(FIXTURES, 'pi-mono'),
  VSCODE_WORKSPACE_STORAGE_DIR: process.env.VSCODE_WORKSPACE_STORAGE_DIR || path.join(FIXTURES, 'vscode-empty'),
  MODERNIZE_SESSION_DIR: process.env.MODERNIZE_SESSION_DIR || path.join(FIXTURES, 'modernize-empty'),
};

export default defineConfig({
  testDir: './__tests__/e2e',
  
  // Maximum time one test can run (increased for large session tests)
  timeout: 60 * 1000,
  
  // Run tests in files in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Reporter
  reporter: 'html',
  
  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: 'http://localhost:3838',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3838',
    reuseExistingServer: true,
    timeout: 30 * 1000,
    env: {
      ...process.env, // Inherit HOME etc.
      ...FIXTURE_ENV,  // Force fixture session dirs (overrides any inherited real dirs)
      PLAYWRIGHT: '1', // Disable rate limiting during E2E tests
    },
  },
});
