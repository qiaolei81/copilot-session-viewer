const express = require('express');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');

// Configuration
const config = require('./config');

// Middleware
const { globalLimiter, insightGenerationLimiter, insightAccessLimiter, uploadLimiter } = require('./middleware/rateLimiting');
const { requestTimeout, developmentCors, errorHandler, notFoundHandler } = require('./middleware/common');

// Controllers
const SessionController = require('./controllers/sessionController');
const InsightController = require('./controllers/insightController');
const UploadController = require('./controllers/uploadController');

function createApp(options = {}) {
  const app = express();

  // Create controller instances (with optional dependency injection)
  const sessionController = new SessionController(options.sessionService);
  const insightController = new InsightController(options.insightService);
  const uploadController = new UploadController();

  // Minimal security headers for local development tool
  // Custom CSP without upgrade-insecure-requests
  app.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "style-src 'self' 'unsafe-inline' https: http:; " +
      "font-src 'self' https: http:; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:; " +
      "img-src 'self' data: https: http:; " +
      "connect-src 'self' https: http:"
    );
    next();
  });
  
  // Other helmet protections (without CSP and HSTS)
  app.use(helmet({
    contentSecurityPolicy: false,
    hsts: false,
    referrerPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false
  }));

  app.use(compression({
    level: 9, // Maximum compression for local use (CPU is not a bottleneck)
    threshold: 1024, // Compress responses > 1KB
    filter: (req, res) => {
      // Always compress JSON responses
      if (res.getHeader('Content-Type')?.includes('application/json')) {
        return true;
      }
      return compression.filter(req, res);
    }
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestTimeout);

  // CORS in development
  if (config.NODE_ENV === 'development') {
    app.use(developmentCors);
  }

  // Rate limiting
  app.use(globalLimiter);

  // Static files
  app.use('/public', express.static(path.join(__dirname, '../public')));

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));

  // Routes with controllers

  // Page routes
  app.get('/', sessionController.getHomepage.bind(sessionController));
  app.get('/session/:id', sessionController.getSessionDetail.bind(sessionController));
  app.get('/session/:id/time-analyze', sessionController.getTimeAnalysis.bind(sessionController));
  app.get('/session/:id/export', sessionController.exportSession.bind(sessionController));

  // API routes (more specific routes first)
  app.get('/api/sessions/load-more', sessionController.loadMoreSessions.bind(sessionController));
  app.get('/api/sessions', sessionController.getSessions.bind(sessionController));
  app.get('/api/sessions/:id/events', sessionController.getSessionEvents.bind(sessionController));
  app.get('/api/sessions/:id/timeline', sessionController.getTimeline.bind(sessionController));

  // Upload routes
  app.get('/session/:id/share', uploadController.shareSession.bind(uploadController));
  app.post('/session/import',
    (req, res, next) => uploadController.getUploadMiddleware()(req, res, next),
    uploadController.importSession.bind(uploadController)
  );

  // Insight routes with appropriate rate limiting
  app.post('/session/:id/insight', insightGenerationLimiter, insightController.generateInsight.bind(insightController));
  app.get('/session/:id/insight', insightController.getInsightStatus.bind(insightController)); // Remove rate limiting for GET
  app.delete('/session/:id/insight', insightAccessLimiter, insightController.deleteInsight.bind(insightController));

  // Upload rate limiting
  app.use('/session/import', uploadLimiter);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;