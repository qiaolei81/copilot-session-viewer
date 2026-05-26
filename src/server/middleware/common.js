const config = require('../config');
const { trackException } = require('../telemetry');

// Request timeout middleware
const requestTimeout = (req, res, next) => {
  req.setTimeout(config.REQUEST_TIMEOUT_MS);
  next();
};

// Telemetry middleware - no-op (connection strings must not be exposed to clients)
const telemetryLocals = (req, res, next) => {
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

  // Track exception in Application Insights
  trackException(err, {
    url: req.url,
    method: req.method,
    statusCode: (err.status || 500).toString(),
    userAgent: (req.headers && req.headers['user-agent']) || 'unknown'
  });

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
  notFoundHandler,
  telemetryLocals
};