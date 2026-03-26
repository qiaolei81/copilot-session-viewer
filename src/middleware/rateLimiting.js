const rateLimit = require('express-rate-limit');

// Disable rate limiting in E2E tests (when NODE_ENV is test or when running via Playwright)
const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT === '1';

function getClientKey(req) {
  return req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress || 'unknown';
}

function shouldSkipInTestEnvironment() {
  return isTestEnvironment;
}

function shouldSkipGlobalRateLimit(req) {
  // Skip rate limiting entirely in test environment
  if (isTestEnvironment) return true;

  const path = req?.path || '';
  const method = req?.method || '';

  // Skip static files
  if (path.startsWith('/public')) return true;

  // Skip insight status checks (GET requests)
  if (method === 'GET' && path.includes('/insight')) return true;

  return false;
}

// Global rate limiting for all routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnvironment ? 10000 : 100, // Much higher limit for tests
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  skip: shouldSkipGlobalRateLimit
});

// Rate limiting for insight generation (stricter for POST)
const insightGenerationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes (shorter window)
  max: 3, // 3 generations per 5-minute window (expensive operations)
  message: {
    error: 'Too many insight generation requests. Please wait 5 minutes before generating another insight.',
    retryAfter: 5 * 60 // 5 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  skip: shouldSkipInTestEnvironment
});

// Rate limiting for insight status/retrieval (very lenient for GET/DELETE)
const insightAccessLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute (shorter window)
  max: 50, // 50 requests per minute (very lenient)
  message: { error: 'Too many insight requests. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  skip: shouldSkipInTestEnvironment
});

// Rate limiting for file uploads (strict)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 uploads per window
  message: { error: 'Too many upload requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  skip: shouldSkipInTestEnvironment
});

module.exports = {
  globalLimiter,
  insightGenerationLimiter,
  insightAccessLimiter,
  uploadLimiter
};