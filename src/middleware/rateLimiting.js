const rateLimit = require('express-rate-limit');

// Global rate limiting for all routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip static files
    if (req.path.startsWith('/public')) return true;

    // Skip insight status checks (GET requests)
    if (req.method === 'GET' && req.path.includes('/insight')) return true;

    return false;
  }
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
  legacyHeaders: false
});

// Rate limiting for insight status/retrieval (very lenient for GET/DELETE)
const insightAccessLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute (shorter window)
  max: 50, // 50 requests per minute (very lenient)
  message: { error: 'Too many insight requests. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting for file uploads (strict)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 uploads per window
  message: { error: 'Too many upload requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  globalLimiter,
  insightGenerationLimiter,
  insightAccessLimiter,
  uploadLimiter
};