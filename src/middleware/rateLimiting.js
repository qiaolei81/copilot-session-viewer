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

// Rate limiting for insight generation (stricter)
const insightLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: { error: 'Too many insight generation requests. Please try again later.' },
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
  insightLimiter,
  uploadLimiter
};