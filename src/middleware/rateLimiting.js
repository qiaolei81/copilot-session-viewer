const rateLimit = require('express-rate-limit');
const config = require('../config');

// Global rate limiting for all routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/public') // Skip static files
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

// Rate limiting for insight status/retrieval (more lenient for GET/DELETE)
const insightAccessLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS, // 15 minutes
  max: config.RATE_LIMIT_MAX_REQUESTS, // 10 requests per window
  message: { error: 'Too many insight requests. Please try again later.' },
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