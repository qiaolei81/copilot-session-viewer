const express = require('express');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');

// Configuration
const config = require('./config');

// Middleware
const { globalLimiter, insightLimiter, uploadLimiter } = require('./middleware/rateLimiting');
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

  // Security and parsing middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        fontSrc: ['\'self\'', 'https://fonts.gstatic.com'],
        scriptSrc: ['\'self\'', '\'unsafe-inline\'', '\'unsafe-eval\'', 'https://cdn.jsdelivr.net'],
        imgSrc: ['\'self\'', 'data:', 'https:']
      }
    }
  }));

  app.use(compression());
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

  // API routes (more specific routes first)
  app.get('/api/sessions/load-more', sessionController.loadMoreSessions.bind(sessionController));
  app.get('/api/sessions', sessionController.getSessions.bind(sessionController));
  app.get('/api/sessions/:id/events', sessionController.getSessionEvents.bind(sessionController));

  // Upload routes
  app.get('/session/:id/share', uploadController.shareSession.bind(uploadController));
  app.post('/session/import',
    (req, res, next) => uploadController.getUploadMiddleware()(req, res, next),
    uploadController.importSession.bind(uploadController)
  );

  // Insight routes with rate limiting
  app.post('/session/:id/insight', insightLimiter, insightController.generateInsight.bind(insightController));
  app.get('/session/:id/insight', insightLimiter, insightController.getInsightStatus.bind(insightController));
  app.delete('/session/:id/insight', insightLimiter, insightController.deleteInsight.bind(insightController));

  // Upload rate limiting
  app.use('/session/import', uploadLimiter);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;