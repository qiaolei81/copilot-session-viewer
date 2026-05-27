import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// NOTE on __dirname: playwright loads this config via its CJS pirate transform
// (see node_modules/playwright/lib/third_party/pirates.js), which injects CJS
// globals — including __dirname — even though the file uses ESM `import` syntax.
// Using `fileURLToPath(import.meta.url)` to "properly" derive __dirname breaks
// because `import.meta` isn't available in the CJS-evaluation context the
// pirate provides. Keep the bare __dirname reference; it's correct for how
// playwright actually loads this file.
const FIXTURES = path.join(__dirname, '__tests__', 'fixtures', 'sessions');

// When E2E_USE_FIXTURES=1, force every session-source adapter to read from the
// sanitized fixture tree. Individual *_DIR env vars still win, so debugging
// against a real session dir remains possible. This guarantees `npm run test:e2e`
// (which sets the flag) never touches the developer's real session data, even
// if they manually started `npm start` first and Playwright reuses that server.
const FIXTURE_ENV = process.env.E2E_USE_FIXTURES === '1' ? {
  COPILOT_SESSION_DIR: process.env.COPILOT_SESSION_DIR || path.join(FIXTURES, 'copilot-cli'),
  CLAUDE_SESSION_DIR: process.env.CLAUDE_SESSION_DIR || path.join(FIXTURES, 'claude'),
  PI_MONO_SESSION_DIR: process.env.PI_MONO_SESSION_DIR || path.join(FIXTURES, 'pi-mono'),
  VSCODE_WORKSPACE_STORAGE_DIR: process.env.VSCODE_WORKSPACE_STORAGE_DIR || path.join(FIXTURES, 'vscode-empty'),
  MODERNIZE_SESSION_DIR: process.env.MODERNIZE_SESSION_DIR || path.join(FIXTURES, 'modernize-empty'),
} : {};

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

  // Run your local dev server before starting the tests.
  // reuseExistingServer is disabled when E2E_USE_FIXTURES=1 (the default
  // for `npm run test:e2e`) so we never accidentally reuse a stray dev
  // server that has the user's real home dirs configured instead of the
  // synthetic fixture env vars. CI sets reuseExistingServer:false too.
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3838',
    reuseExistingServer: process.env.E2E_USE_FIXTURES !== '1' && !process.env.CI,
    timeout: 30 * 1000,
    env: {
      ...process.env, // Inherit HOME etc.
      ...FIXTURE_ENV,  // Force fixture session dirs when E2E_USE_FIXTURES=1
      PLAYWRIGHT: '1', // Disable rate limiting during E2E tests
      CUSTOM_DIRS_REGISTRY: process.env.CUSTOM_DIRS_REGISTRY
        || path.join(__dirname, '__tests__', 'fixtures', '.e2e-registered-dirs.json'),
    },
  },
});
