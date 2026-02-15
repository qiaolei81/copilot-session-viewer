const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');

// Application modules
const config = require('./src/config');
const SessionRepository = require('./src/sessionRepository');
const InsightService = require('./src/insightService');
const { buildMetadata, isValidSessionId } = require('./src/helpers');
const processManager = require('./src/processManager');

const app = express();

// Session directory configuration
const SESSION_DIR = process.env.SESSION_DIR || path.join(os.homedir(), '.copilot', 'session-state');

// Initialize services
const sessionRepository = new SessionRepository(SESSION_DIR);
const insightService = new InsightService(SESSION_DIR);

// Middleware setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', config.NODE_ENV === 'production');

// Security headers (helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

// Enable compression
app.use(compression());

// CORS for development (with explicit origin instead of wildcard)
if (config.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    const allowedOrigins = ['http://localhost:3838', 'http://127.0.0.1:3838'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });
}

// Serve static files
app.use(express.static('public'));

// Parse JSON bodies with explicit size limit
app.use(express.json({ limit: '100kb' }));

// Request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(config.REQUEST_TIMEOUT_MS);
  next();
});

// Rate limiting for insight generation
const insightLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: { error: 'Too many insight generation requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Helper: Get all sessions (async)
async function getAllSessions() {
  const sessions = await sessionRepository.findAll();
  return sessions.map(s => s.toJSON());
}

// Helper: Get session events (async, with streaming)
async function getSessionEvents(sessionId) {
  if (!isValidSessionId(sessionId)) {
    return [];
  }

  const sessionPath = path.join(SESSION_DIR, sessionId);
  let eventsFile;
  
  try {
    const stats = await fs.promises.stat(sessionPath);
    if (stats.isDirectory()) {
      eventsFile = path.join(sessionPath, 'events.jsonl');
    } else {
      eventsFile = path.join(SESSION_DIR, `${sessionId}.jsonl`);
    }
  } catch (err) {
    eventsFile = path.join(SESSION_DIR, `${sessionId}.jsonl`);
  }
  
  try {
    await fs.promises.access(eventsFile);
  } catch (err) {
    return [];
  }
  
  try {
    const content = await fs.promises.readFile(eventsFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    return lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        console.error(`Error parsing line ${index + 1}:`, err.message);
        return null;
      }
    }).filter(event => event !== null);
  } catch (err) {
    console.error('Error reading events:', err);
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────

// Homepage
app.get('/', async (req, res) => {
  try {
    const sessions = await getAllSessions();
    res.render('index', { sessions });
  } catch (err) {
    console.error('Error loading sessions:', err);
    res.status(500).send('Error loading sessions');
  }
});

// Session detail page
app.get('/session/:id', async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const events = await getSessionEvents(sessionId);
    const metadata = buildMetadata(session);
  
    // Extract model from events
    const sessionStartEvent = events.find(e => e.type === 'session.start');
    if (sessionStartEvent?.data?.selectedModel) {
      metadata.model = sessionStartEvent.data.selectedModel;
    }
    
    const modelChangeEvent = events.find(e => e.type === 'session.model_change');
    if (modelChangeEvent?.data) {
      metadata.model = modelChangeEvent.data.newModel || modelChangeEvent.data.model;
    }
    
    res.render('session-vue', { sessionId, events, metadata });
  } catch (err) {
    console.error('Error loading session:', err);
    res.status(500).json({ error: 'Error loading session' });
  }
});

// Time analysis page
app.get('/session/:id/time-analyze', async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.id === sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const events = await getSessionEvents(sessionId);
    const metadata = buildMetadata(session);

    const sessionStartEvent = events.find(e => e.type === 'session.start');
    if (sessionStartEvent?.data?.selectedModel) {
      metadata.model = sessionStartEvent.data.selectedModel;
    }

    const modelChangeEvent = events.find(e => e.type === 'session.model_change');
    if (modelChangeEvent?.data) {
      metadata.model = modelChangeEvent.data.newModel || modelChangeEvent.data.model;
    }

    res.render('time-analyze', { sessionId, events, metadata });
  } catch (err) {
    console.error('Error loading time analysis:', err);
    res.status(500).json({ error: 'Error loading analysis' });
  }
});

// API: Get all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await getAllSessions();
    res.json(sessions);
  } catch (err) {
    console.error('Error loading sessions:', err);
    res.status(500).json({ error: 'Error loading sessions' });
  }
});

// API: Get session events
app.get('/api/sessions/:id/events', async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const events = await getSessionEvents(sessionId);
    res.json(events);
  } catch (err) {
    console.error('Error loading events:', err);
    res.status(500).json({ error: 'Error loading events' });
  }
});

// ──────────────────────────────────────────────────────────
// Copilot Insight API (with fixes)
// ──────────────────────────────────────────────────────────

// Generate or get insight
app.post('/session/:id/insight', insightLimiter, async (req, res) => {
  try {
    const sessionId = req.params.id;
    const forceRegenerate = req.body?.force === true;
    
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const result = await insightService.generateInsight(sessionId, forceRegenerate);
    res.json(result);
  } catch (err) {
    console.error('Error generating insight:', err);
    res.status(500).json({ error: err.message || 'Error generating insight' });
  }
});

// Get insight status
app.get('/session/:id/insight', async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const result = await insightService.getInsightStatus(sessionId);
    res.json(result);
  } catch (err) {
    console.error('Error getting insight status:', err);
    res.status(500).json({ error: 'Error getting insight status' });
  }
});

// Delete insight
app.delete('/session/:id/insight', async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const result = await insightService.deleteInsight(sessionId);
    res.json(result);
  } catch (err) {
    console.error('Error deleting insight:', err);
    res.status(500).json({ error: 'Error deleting insight' });
  }
});

// ──────────────────────────────────────────────────────────
// Share/Import Session
// ──────────────────────────────────────────────────────────

// Share session (export as zip)
app.get('/session/:id/share', async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const sessionPath = path.join(SESSION_DIR, sessionId);
    
    try {
      await fs.promises.access(sessionPath);
    } catch (err) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const { spawn } = require('child_process');
    const zipFile = path.join(os.tmpdir(), `session-${sessionId}.zip`);
    
    const zipProcess = spawn('zip', ['-r', '-q', zipFile, sessionId], {
      cwd: SESSION_DIR
    });
    
    processManager.register(zipProcess, { name: `zip-${sessionId}` });
    
    zipProcess.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: 'Failed to create zip file' });
      }
      
      res.download(zipFile, `session-${sessionId}.zip`, (err) => {
        fs.promises.unlink(zipFile).catch(() => {});
        if (err) {
          console.error('Error sending zip:', err);
        }
      });
    });
    
    zipProcess.on('error', (err) => {
      console.error('Error creating zip:', err);
      res.status(500).json({ error: 'Failed to create zip file' });
    });
  } catch (err) {
    console.error('Error sharing session:', err);
    res.status(500).json({ error: 'Error sharing session' });
  }
});

// Import session from zip (with validation)
const uploadDir = path.join(os.tmpdir(), 'copilot-session-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: config.MAX_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.endsWith('.zip')) {
      return cb(new Error('Only .zip files are allowed'));
    }
    cb(null, true);
  }
});

app.post('/session/import', upload.single('zipFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const zipPath = req.file.path;
    const extractDir = path.join(uploadDir, `extract-${Date.now()}`);
    
    await fs.promises.mkdir(extractDir, { recursive: true });
    
    const { spawn } = require('child_process');
    const unzipProcess = spawn('unzip', ['-q', zipPath, '-d', extractDir]);
    
    processManager.register(unzipProcess, { name: 'unzip-import' });
    
    unzipProcess.on('close', async (code) => {
      try {
        await fs.promises.unlink(zipPath);
        
        if (code !== 0) {
          await fs.promises.rm(extractDir, { recursive: true, force: true });
          return res.status(500).json({ error: 'Failed to extract zip file' });
        }
        
        const entries = await fs.promises.readdir(extractDir);
        if (entries.length === 0) {
          await fs.promises.rm(extractDir, { recursive: true, force: true });
          return res.status(400).json({ error: 'Empty zip file' });
        }
        
        const sessionDirName = entries[0];
        
        // Validate session directory name to prevent Zip Slip path traversal
        if (!isValidSessionId(sessionDirName)) {
          await fs.promises.rm(extractDir, { recursive: true, force: true });
          return res.status(400).json({ error: 'Invalid session directory name in zip file' });
        }
        
        const sessionPath = path.join(extractDir, sessionDirName);
        const targetPath = path.join(SESSION_DIR, sessionDirName);
        
        const eventsFile = path.join(sessionPath, 'events.jsonl');
        try {
          await fs.promises.access(eventsFile);
        } catch (err) {
          await fs.promises.rm(extractDir, { recursive: true, force: true });
          return res.status(400).json({ error: 'Invalid session structure (no events.jsonl)' });
        }
        
        if (fs.existsSync(targetPath)) {
          await fs.promises.rm(extractDir, { recursive: true, force: true });
          return res.status(409).json({ error: 'Session already exists' });
        }
        
        await fs.promises.rename(sessionPath, targetPath);
        await fs.promises.rm(extractDir, { recursive: true, force: true });
        
        res.json({ success: true, sessionId: sessionDirName });
      } catch (err) {
        console.error('Error importing session:', err);
        await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
        res.status(500).json({ error: 'Error importing session' });
      }
    });
    
    unzipProcess.on('error', async (err) => {
      console.error('Error extracting zip:', err);
      await fs.promises.unlink(zipPath).catch(() => {});
      await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
      res.status(500).json({ error: 'Failed to extract zip file' });
    });
  } catch (err) {
    console.error('Error processing upload:', err);
    if (req.file) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: 'Error processing upload' });
  }
});

// ──────────────────────────────────────────────────────────
// Error Handling
// ──────────────────────────────────────────────────────────

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  
  const statusCode = err.status || 500;
  // Default to production-safe behavior if NODE_ENV is not set
  const isDevelopment = config.NODE_ENV === 'development';
  const message = isDevelopment ? err.message : 'Internal server error';

  res.status(statusCode).json({
    error: message,
    ...(isDevelopment && { stack: err.stack })
  });
});

// ──────────────────────────────────────────────────────────
// Start Server
// ──────────────────────────────────────────────────────────

const server = app.listen(config.PORT, () => {
  console.log(`🚀 Copilot Session Viewer running at http://localhost:${config.PORT}`);
  console.log(`📂 Monitoring: ${SESSION_DIR}`);
  console.log(`🔧 Environment: ${config.NODE_ENV}`);
  console.log(`⚡ Active processes: ${processManager.getActiveCount()}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📛 SIGTERM received, closing server...');
  server.close(() => {
    console.log('✅ Server closed');
  });
});

module.exports = app;
