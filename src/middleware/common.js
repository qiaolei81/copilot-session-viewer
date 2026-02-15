const config = require('../config');

// Request timeout middleware
const requestTimeout = (req, res, next) => {
  req.setTimeout(config.REQUEST_TIMEOUT_MS);
  next();
};

// CORS middleware for development
const developmentCors = (req, res, next) => {
  if (config.NODE_ENV === 'development') {
    const allowedOrigins = ['http://localhost:3838', 'http://127.0.0.1:3838'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
  }
  next();
};

// Error handling middleware
const errorHandler = (err, req, res, _next) => {
  console.error('Unhandled error:', err.stack);

  const statusCode = err.status || 500;
  // Default to production-safe behavior if NODE_ENV is not set
  const isDevelopment = config.NODE_ENV === 'development';
  const message = isDevelopment ? err.message : 'Internal server error';

  res.status(statusCode).json({
    error: message,
    ...(isDevelopment && { stack: err.stack })
  });
};

// 404 handler
const notFoundHandler = (req, res) => {
  res.status(404).json({ error: 'Not found' });
};

module.exports = {
  requestTimeout,
  developmentCors,
  errorHandler,
  notFoundHandler
};