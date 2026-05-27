const express = require('express');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');

// Configuration
const config = require('./config');

// Middleware
// Rate limiting disabled for local development

const { requestTimeout, developmentCors, errorHandler, notFoundHandler, telemetryLocals } = require('./middleware/common');

// Source mapping
const { isValidSource, getAllSources } = require('./utils/sourceMapping');

// Controllers
const SessionController = require('./controllers/sessionController');
const InsightController = require('./controllers/insightController');
const UploadController = require('./controllers/uploadController');
const TagController = require('./controllers/tagController');
const DirController = require('./controllers/dirController');
const DirRegistryService = require('./services/dirRegistryService');
const { isValidUuidV4 } = require('./utils/helpers');

// Source validation middleware
function validateSource(req, res, next) {
  const { source } = req.params;
  if (!isValidSource(source)) {
    const sanitizedSource = String(source).replace(/[^a-zA-Z0-9_-]/g, '');
    return res.status(404).json({ error: `Unknown source: ${sanitizedSource}` });
  }
  next();
}

// :id validation middleware for registered-dir routes
function validateDirId(req, res, next) {
  if (!isValidUuidV4(req.params.id)) {
    return res.status(400).json({ error: 'Invalid dir id' });
  }
  next();
}

function createApp(options = {}) {
  const app = express();

  // Disable Express's automatic ETag generation (prevents 304 on live/active session files)
  app.set('etag', false);

  // Create controller instances (with optional dependency injection)
  const dirRegistryService = options.dirRegistryService || new DirRegistryService();
  const sessionController = new SessionController(options.sessionService, options.tagService, dirRegistryService);
  const insightController = new InsightController(options.insightService, options.sessionService);
  const uploadController = new UploadController();
  const tagController = new TagController(options.tagService);
  const dirController = new DirController(dirRegistryService);

  // Minimal security headers for local development tool
  // Custom CSP without upgrade-insecure-requests
  app.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "font-src 'self'; " +
      "script-src 'self'; " +
      "img-src 'self' data:; " +
      "connect-src 'self'"
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
    level: 1, // Fast compression (speed > ratio for local use)
    threshold: 1024, // Compress responses > 1KB
    filter: (req, res) => {
      // Skip compression for large JSON API responses (handled separately)
      if (req.path.includes('/events') && res.getHeader('Content-Type')?.includes('application/json')) {
        return false;
      }
      return compression.filter(req, res);
    }
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestTimeout);
  app.use(telemetryLocals);

  // CORS in development
  if (config.NODE_ENV === 'development') {
    app.use(developmentCors);
  }

  // Rate limiting - DISABLED for local development


  // Static files (legacy public folder)
  app.use('/public', express.static(path.join(__dirname, '../../public')));

  // Serve Vue SPA static assets from dist/client
  app.use(express.static(path.join(__dirname, '../../dist/client')));

  // ── API routes ──

  // Sources endpoint
  app.get('/api/sources', (req, res) => {
    res.json(getAllSources());
  });

  // Source hints (directory paths per source type)
  app.get('/api/source-hints', (req, res) => {
    const sources = sessionController.sessionService.sessionRepository.sources;
    const hints = {};
    if (sources) {
      for (const src of sources) {
        hints[src.type] = { configured: true, dir: src.dir };
      }
    }
    res.json(hints);
  });

  // Global tags (no source needed)
  app.get('/api/tags', tagController.getAllTags.bind(tagController));

  // Registered custom directories
  app.get('/api/dirs', dirController.listDirs.bind(dirController));
  app.post('/api/dirs', dirController.registerDir.bind(dirController));
  app.delete('/api/dirs/:id', validateDirId, dirController.removeDir.bind(dirController));

  // Import (no source needed — auto-detected)
  app.post('/api/import',
    (req, res, next) => uploadController.getUploadMiddleware()(req, res, next),
    uploadController.importSession.bind(uploadController)
  );

  // ── Source-scoped routes ── (all use :source param with validation)

  // Session list
  app.get('/api/:source/sessions', validateSource, sessionController.getSessions.bind(sessionController));

  // Session detail
  app.get('/api/:source/sessions/:sessionId', validateSource, sessionController.getSessionById.bind(sessionController));

  // Session events
  app.get('/api/:source/sessions/:sessionId/events', validateSource, sessionController.getSessionEvents.bind(sessionController));

  // Session timeline
  app.get('/api/:source/sessions/:sessionId/timeline', validateSource, sessionController.getTimeline.bind(sessionController));

  // Session export
  app.get('/api/:source/sessions/:sessionId/export', validateSource, sessionController.exportSession.bind(sessionController));

  // Session tags
  app.get('/api/:source/sessions/:sessionId/tags', validateSource, tagController.getSessionTags.bind(tagController));
  app.put('/api/:source/sessions/:sessionId/tags', validateSource, tagController.setSessionTags.bind(tagController));

  

  // Insight routes
  app.post('/api/:source/sessions/:sessionId/insight', validateSource, insightController.generateInsight.bind(insightController));
  app.get('/api/:source/sessions/:sessionId/insight', validateSource, insightController.getInsightStatus.bind(insightController));
  app.delete('/api/:source/sessions/:sessionId/insight', validateSource, insightController.deleteInsight.bind(insightController));

  // SPA fallback: serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Skip API routes and static files
    if (req.path.startsWith('/api/') || req.path.startsWith('/public/')) {
      return next();
    }
    res.sendFile(path.join(__dirname, '../../dist/client/index.html'));
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
