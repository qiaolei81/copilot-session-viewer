const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3838;

// Session state directory
const SESSION_DIR = path.join(os.homedir(), '.copilot', 'session-state');

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', false); // Disable template caching for development

// Serve static files
app.use(express.static('public'));

// Helper: Get all sessions
function getAllSessions() {
  const sessions = [];
  
  try {
    const entries = fs.readdirSync(SESSION_DIR);
    
    for (const entry of entries) {
      if (entry === '.DS_Store') continue;
      
      const fullPath = path.join(SESSION_DIR, entry);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        // Directory-based session
        const workspaceFile = path.join(fullPath, 'workspace.yaml');
        const eventsFile = path.join(fullPath, 'events.jsonl');
        
        if (fs.existsSync(workspaceFile)) {
          const workspace = parseWorkspaceYAML(workspaceFile);
          
          // Count events
          let eventCount = 0;
          if (fs.existsSync(eventsFile)) {
            try {
              const content = fs.readFileSync(eventsFile, 'utf-8');
              eventCount = content.trim().split('\n').filter(line => line.trim()).length;
            } catch (err) {
              console.error('Error counting events:', err);
            }
          }
          
          sessions.push({
            id: entry,
            type: 'directory',
            workspace: workspace,
            createdAt: workspace?.created_at || stats.birthtime,
            updatedAt: workspace?.updated_at || stats.mtime,
            summary: workspace?.summary || 'No summary',
            hasEvents: fs.existsSync(eventsFile),
            eventCount: eventCount
          });
        }
      } else if (entry.endsWith('.jsonl')) {
        // Single-file session
        const sessionId = entry.replace('.jsonl', '');
        
        // Count events
        let eventCount = 0;
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
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

// Helper: Parse workspace.yaml
function parseWorkspaceYAML(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
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

// Helper: Get session events
function getSessionEvents(sessionId) {
  const sessionPath = path.join(SESSION_DIR, sessionId);
  let eventsFile;
  
  if (fs.existsSync(sessionPath) && fs.statSync(sessionPath).isDirectory()) {
    eventsFile = path.join(sessionPath, 'events.jsonl');
  } else {
    eventsFile = path.join(SESSION_DIR, `${sessionId}.jsonl`);
  }
  
  if (!fs.existsSync(eventsFile)) {
    return [];
  }
  
  try {
    const content = fs.readFileSync(eventsFile, 'utf-8');
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
app.get('/', (req, res) => {
  const sessions = getAllSessions();
  res.render('index', { sessions });
});

app.get('/session/:id', (req, res) => {
  const sessionId = req.params.id;
  const sessions = getAllSessions();
  const session = sessions.find(s => s.id === sessionId);
  
  if (!session) {
    return res.status(404).send('Session not found');
  }
  
  const events = getSessionEvents(sessionId);
  
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
});

app.get('/api/sessions', (req, res) => {
  const sessions = getAllSessions();
  res.json(sessions);
});

app.get('/api/session/:id/events', (req, res) => {
  const events = getSessionEvents(req.params.id);
  res.json(events);
});

app.listen(PORT, () => {
  console.log(`🚀 Copilot Session Viewer running at http://localhost:${PORT}`);
  console.log(`📂 Monitoring: ${SESSION_DIR}`);
});
