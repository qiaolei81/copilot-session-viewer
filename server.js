const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();

// Configuration from environment variables
const PORT = process.env.PORT || 3838;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_DIR = process.env.SESSION_DIR || path.join(os.homedir(), '.copilot', 'session-state');

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', NODE_ENV === 'production'); // Cache templates in production

// Serve static files
app.use(express.static('public'));

// Security: Validate session ID to prevent path traversal
function isValidSessionId(sessionId) {
  // Only allow alphanumeric, hyphens, and underscores
  return /^[a-zA-Z0-9_-]+$/.test(sessionId) && sessionId.length < 256;
}

// Security: Get safe session path (prevents path traversal)
function getSafeSessionPath(sessionId) {
  if (!isValidSessionId(sessionId)) {
    throw new Error('Invalid session ID');
  }
  
  const sessionPath = path.join(SESSION_DIR, sessionId);
  const normalizedPath = path.normalize(sessionPath);
  
  // Ensure resolved path is still within SESSION_DIR
  if (!normalizedPath.startsWith(SESSION_DIR)) {
    throw new Error('Path traversal attempt detected');
  }
  
  return normalizedPath;
}

// Helper: Get all sessions (async)
async function getAllSessions() {
  const sessions = [];
  
  try {
    const entries = await fs.promises.readdir(SESSION_DIR);
    
    for (const entry of entries) {
      if (entry === '.DS_Store') continue;
      
      const fullPath = path.join(SESSION_DIR, entry);
      const stats = await fs.promises.stat(fullPath);
      
      if (stats.isDirectory()) {
        // Directory-based session
        const workspaceFile = path.join(fullPath, 'workspace.yaml');
        const eventsFile = path.join(fullPath, 'events.jsonl');
        
        try {
          await fs.promises.access(workspaceFile);
          const workspace = await parseWorkspaceYAML(workspaceFile);
          
          // Count events
          let eventCount = 0;
          let hasEvents = false;
          try {
            await fs.promises.access(eventsFile);
            hasEvents = true;
            const content = await fs.promises.readFile(eventsFile, 'utf-8');
            eventCount = content.trim().split('\n').filter(line => line.trim()).length;
          } catch (err) {
            // Events file doesn't exist
          }
          
          sessions.push({
            id: entry,
            type: 'directory',
            workspace: workspace,
            createdAt: workspace?.created_at || stats.birthtime,
            updatedAt: workspace?.updated_at || stats.mtime,
            summary: workspace?.summary || 'No summary',
            hasEvents: hasEvents,
            eventCount: eventCount
          });
        } catch (err) {
          // workspace.yaml doesn't exist, skip this directory
        }
      } else if (entry.endsWith('.jsonl')) {
        // Single-file session
        const sessionId = entry.replace('.jsonl', '');
        
        // Count events
        let eventCount = 0;
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          eventCount = content.trim().split('\n').filter(line => line.trim()).length;
        } catch (err) {
          console.error('Error counting events:', err);
        }
        
        sessions.push({
          id: sessionId,
          type: 'file',
          createdAt: stats.birthtime,
          updatedAt: stats.mtime,
          summary: 'Legacy session',
          hasEvents: true,
          eventCount: eventCount
        });
      }
    }
  } catch (err) {
    console.error('Error reading sessions:', err);
  }
  
  // Sort by updated time (newest first)
  sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  
  return sessions;
}

// Helper: Parse workspace.yaml (async)
async function parseWorkspaceYAML(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const workspace = {};
    
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        workspace[match[1]] = match[2].trim();
      }
    }
    
    return workspace;
  } catch (err) {
    console.error('Error parsing workspace.yaml:', err);
    return {};
  }
}

// Helper: Get session events (async)
async function getSessionEvents(sessionId) {
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
    // If sessionPath doesn't exist, try .jsonl file
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

// Routes
app.get('/', async (req, res) => {
  const sessions = await getAllSessions();
  res.render('index', { sessions });
});

app.get('/session/:id', async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    // Validate session ID to prevent path traversal
    if (!isValidSessionId(sessionId)) {
      return res.status(400).send('Invalid session ID');
    }
    
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      return res.status(404).send('Session not found');
    }
    
    const events = await getSessionEvents(sessionId);
  
  // Extract metadata
  const metadata = {
    type: session.type,
    summary: session.summary,
    model: session.model,
    repo: session.workspace?.repository,
    branch: session.workspace?.branch,
    cwd: session.workspace?.cwd,
    created: session.createdAt,
    updated: session.updatedAt
  };
  
  // Extract model from events
  const sessionStartEvent = events.find(e => e.type === 'session.start');
  if (sessionStartEvent && sessionStartEvent.data && sessionStartEvent.data.selectedModel) {
    metadata.model = sessionStartEvent.data.selectedModel;
  }
  
  const modelChangeEvent = events.find(e => e.type === 'session.model_change');
  if (modelChangeEvent && modelChangeEvent.data) {
    metadata.model = modelChangeEvent.data.newModel || modelChangeEvent.data.model;
  }
  
  res.render('session-vue', { sessionId, events, metadata });
  } catch (err) {
    console.error('Error loading session:', err);
    res.status(500).send('Error loading session');
  }
});

app.get('/api/sessions', async (req, res) => {
  const sessions = await getAllSessions();
  res.json(sessions);
});

app.get('/api/session/:id/events', async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    // Validate session ID to prevent path traversal
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

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  
  // Send appropriate error response
  const statusCode = err.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Copilot Session Viewer running at http://localhost:${PORT}`);
  console.log(`📂 Monitoring: ${SESSION_DIR}`);
});
