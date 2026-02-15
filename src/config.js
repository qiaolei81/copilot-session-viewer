/**
 * Application Configuration Constants
 */

module.exports = {
  // Server
  PORT: process.env.PORT || 3838,
  NODE_ENV: process.env.NODE_ENV || 'production', // Default to production for security
  
  // Insight Generation
  INSIGHT_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
  INSIGHT_CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  
  // File Upload
  MAX_UPLOAD_SIZE: 10 * 1024 * 1024, // 10MB (reduced from 50MB for security)
  
  // Session Repository
  SESSION_CACHE_TTL_MS: 30 * 1000, // 30 seconds
  
  // Request Limits
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 5,
  REQUEST_TIMEOUT_MS: 30 * 1000, // 30 seconds
  
  // Path Configuration
  getBrewPath() {
    return process.platform === 'darwin'
      ? '/opt/homebrew/bin:'
      : '';
  }
};
