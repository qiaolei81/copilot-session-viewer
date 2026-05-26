// __tests__/e2e/fixtures.js
const playwright = require('@playwright/test');

const test = playwright.test;

async function getJsonWithRetry(request, url, options = {}) {
  const {
    retries = 5,
    retryDelayMs = 500,
    validate = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await request.get(url);

      if (!response.ok()) {
        throw new Error(`${url} returned ${response.status()}`);
      }

      const data = await response.json();

      if (typeof validate === 'function') {
        validate(data);
      }

      return data;
    } catch (error) {
      lastError = error;

      if (attempt === retries - 1) {
        throw new Error(`Failed to fetch ${url} after ${retries} attempts: ${error.message}`, { cause: error });
      }

      await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  }

  throw lastError;
}

async function getSessionsWithRetry(request, options = {}) {
  const source = options.source || 'copilot-cli';
  const sessions = await getJsonWithRetry(request, `/api/${source}/sessions`, {
    ...options,
    validate(data) {
      if (!Array.isArray(data)) {
        throw new Error(`/api/${source}/sessions did not return an array of sessions`);
      }

      if (typeof options.validate === 'function') {
        options.validate(data);
      }
    }
  });
  return sessions.map(s => ({ ...s, urlSource: s.urlSource || source }));
}

/**
 * Fetch sessions from all sources and return a merged array.
 */
async function getAllSourceSessionsWithRetry(request, options = {}) {
  const sources = ['copilot-cli', 'claude', 'copilot-chat', 'pi-mono', 'modernize'];
  const results = await Promise.allSettled(
    sources.map(source =>
      getSessionsWithRetry(request, { ...options, source })
        .then(sessions => sessions.map(s => ({ ...s, urlSource: source })))
        .catch(() => [])
    )
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

module.exports = {
  test,
  expect: playwright.expect,
  getJsonWithRetry,
  getSessionsWithRetry,
  getAllSourceSessionsWithRetry
};
