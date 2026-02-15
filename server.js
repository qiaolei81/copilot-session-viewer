const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const SessionRepository = require('./src/sessionRepository');

const app = express();

// Configuration from environment variables
const PORT = process.env.PORT || 3838;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_DIR = process.env.SESSION_DIR || path.join(os.homedir(), '.copilot', 'session-state');

// Initialize session repository
const sessionRepository = new SessionRepository(SESSION_DIR);

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', NODE_ENV === 'production');

// Serve static files
app.use(express.static('public'));

// Parse JSON bodies
app.use(express.json());

// Security: Validate session ID to prevent path traversal
function isValidSessionId(sessionId) {
  // Only allow alphanumeric, hyphens, and underscores
  return /^[a-zA-Z0-9_-]+$/.test(sessionId) && sessionId.length < 256;
}

// Helper: Get all sessions (async)
async function getAllSessions() {
  const sessions = await sessionRepository.findAll();
  return sessions.map(s => s.toJSON());
}

// Helper: Get session events (async)
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
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
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
    updated: session.updatedAt,
    copilotVersion: session.copilotVersion
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
    res.status(500).json({ error: 'Error loading session' });
  }
});

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

    const metadata = {
      type: session.type,
      summary: session.summary,
      model: session.model,
      repo: session.workspace?.repository,
      branch: session.workspace?.branch,
      cwd: session.workspace?.cwd,
      created: session.createdAt,
      updated: session.updatedAt,
      copilotVersion: session.copilotVersion
    };

    const sessionStartEvent = events.find(e => e.type === 'session.start');
    if (sessionStartEvent && sessionStartEvent.data && sessionStartEvent.data.selectedModel) {
      metadata.model = sessionStartEvent.data.selectedModel;
    }

    const modelChangeEvent = events.find(e => e.type === 'session.model_change');
    if (modelChangeEvent && modelChangeEvent.data) {
      metadata.model = modelChangeEvent.data.newModel || modelChangeEvent.data.model;
    }

    res.render('time-analyze', { sessionId, events, metadata });
  } catch (err) {
    console.error('Error loading time analysis:', err);
    res.status(500).json({ error: 'Error loading time analysis' });
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
  const message = NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    error: message,
    ...(NODE_ENV !== 'production' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Copilot Session Viewer running at http://localhost:${PORT}`);
  console.log(`📂 Monitoring: ${SESSION_DIR}`);
});

// ── Copilot Insight API ──
app.post('/session/:id/insight', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const forceRegenerate = req.body?.force === true;
    
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const sessionDir = path.join(SESSION_DIR, sessionId);
    const insightFile = path.join(sessionDir, 'insight-report.md');
    const incompleteFile = path.join(sessionDir, 'insight-report.md.incomplete');
    const eventsFile = path.join(sessionDir, 'events.jsonl');
    
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    
    // Check if complete insight already exists
    if (fs.existsSync(insightFile) && !forceRegenerate) {
      const report = fs.readFileSync(insightFile, 'utf-8');
      return res.json({ 
        status: 'completed',
        report,
        generatedAt: fs.statSync(insightFile).mtime
      });
    }
    
    // Check if generation is in progress
    if (fs.existsSync(incompleteFile) && !forceRegenerate) {
      const stats = fs.statSync(incompleteFile);
      const ageMs = Date.now() - stats.mtime.getTime();
      
      if (ageMs < TIMEOUT_MS) {
        // Still generating
        const partialReport = fs.readFileSync(incompleteFile, 'utf-8');
        return res.json({
          status: 'generating',
          report: partialReport,
          startedAt: stats.birthtime,
          lastUpdate: stats.mtime
        });
      }
      
      // Timed out - allow regeneration
      console.log(`Incomplete file timed out (${Math.floor(ageMs/1000)}s old), allowing regeneration`);
    }
    
    // Check if events file exists
    if (!fs.existsSync(eventsFile)) {
      return res.status(404).json({ error: 'Events file not found' });
    }
    
    // Clean up old files if force regenerate
    if (forceRegenerate) {
      if (fs.existsSync(insightFile)) fs.unlinkSync(insightFile);
      if (fs.existsSync(incompleteFile)) fs.unlinkSync(incompleteFile);
    }
    
    // Create incomplete file immediately
    fs.writeFileSync(incompleteFile, '# Generating Copilot Insight...\n\nAnalysis in progress. Please wait.\n', 'utf-8');
    
    // Generate insight using copilot CLI
    const { spawn } = require('child_process');
    const path_env = '/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin:' + process.env.PATH;
    
    const prompt = `Analyze this GitHub Copilot CLI session data (JSONL format, one event per line) and generate a deep, actionable insight report.

CRITICAL: Output ONLY the analysis report. Do NOT include thinking blocks, reasoning steps, or meta-commentary about your analysis process. Go straight to insights.

Focus on:
1. **Session Health Score** (0-100): Calculate based on success rate, completion rate, and performance
   - Red flags: error rate >50%, incomplete sub-agents, timeout patterns
   
2. **Critical Issues** (if any):
   - What went wrong and why (root cause analysis)
   - Impact on user workflow
   - Specific failing patterns (e.g., "all 'create' calls missing file_text parameter")

3. **Performance Bottlenecks**:
   - Slowest operations with timing data
   - Where LLM is spending most time
   - Tool execution delays vs LLM thinking time

4. **Sub-Agent Effectiveness**:
   - Which sub-agents succeeded/failed and why
   - Completion patterns and failure points
   - Resource utilization (tool calls per sub-agent)

5. **Tool Usage Intelligence**:
   - Most/least used tools
   - Error patterns per tool type
   - Unused but potentially helpful tools

6. **Workflow Recommendations**:
   - Actionable improvements (specific, not generic)
   - Configuration tuning suggestions
   - Anti-patterns detected

Use data-driven language with specific numbers. Be critical, not descriptive. Focus on "why" and "what to do" rather than "what happened".

Output in clean Markdown with ## headers. Keep it concise but insightful (<2000 words).`;
    
    // Create temporary config directory for copilot CLI (cross-platform)
    const tmpDir = path.join(os.tmpdir(), `copilot-insight-${sessionId}-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    
    console.log(`📁 Using temporary config dir: ${tmpDir}`);
    
    // Use bash redirection to write directly to file with --config-dir
    const copilot = spawn('bash', ['-c', 
      `cat "${eventsFile}" | copilot --config-dir "${tmpDir}" --yolo -p "${prompt.replace(/"/g, '\\"')}" > "${incompleteFile}" 2>&1`
    ], {
      env: { ...process.env, PATH: path_env },
      cwd: sessionDir
    });
    
    let error = '';
    
    copilot.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    copilot.on('close', (code) => {
      try {
        if (code !== 0) {
          console.error('Copilot CLI failed:', error);
          fs.writeFileSync(incompleteFile, 
            `# ❌ Generation Failed\n\n\`\`\`\n${error}\n\`\`\`\n`, 
            'utf-8'
          );
          // Clean up temp dir on failure
          try {
            if (fs.existsSync(tmpDir)) {
              fs.rmSync(tmpDir, { recursive: true, force: true });
              console.log(`🗑️  Cleaned up temp dir (failed): ${tmpDir}`);
            }
          } catch (cleanupErr) {
            console.error('Failed to clean up temp dir:', cleanupErr);
          }
          return;
        }
        
        // Read and clean the output
        let report = fs.readFileSync(incompleteFile, 'utf-8');
        
        // Remove <thinking>...</thinking> blocks
        report = report.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
        
        // Remove meta-commentary
        report = report.replace(/^(Let me analyze|I'll analyze|Analyzing|Here's my analysis of).*$/gm, '');
        
        // Trim excessive whitespace
        report = report.replace(/\n{3,}/g, '\n\n').trim();
        
        // Save cleaned version and rename
        fs.writeFileSync(incompleteFile, report, 'utf-8');
        fs.renameSync(incompleteFile, insightFile);
        
        console.log(`✅ Insight generated for session ${sessionId}`);
        
        // Clean up temporary copilot config directory
        try {
          if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            console.log(`🗑️  Cleaned up temp dir: ${tmpDir}`);
          }
        } catch (err) {
          console.error('Failed to clean up temp dir:', err);
        }
      } catch (err) {
        console.error('Error finalizing insight:', err);
        // Clean up temp dir on error too
        try {
          if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          }
        } catch (cleanupErr) {
          console.error('Failed to clean up temp dir on error:', cleanupErr);
        }
      }
    });
    
    // Return immediately with "generating" status
    res.json({
      status: 'generating',
      report: '# Generating Copilot Insight...\n\nAnalysis in progress. Please wait.\n',
      startedAt: new Date()
    });
    
  } catch (err) {
    console.error('Insight generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/session/:id/insight', async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const sessionDir = path.join(SESSION_DIR, sessionId);
    const insightFile = path.join(sessionDir, 'insight-report.md');
    const incompleteFile = path.join(sessionDir, 'insight-report.md.incomplete');
    
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    
    // Check for completed insight
    if (fs.existsSync(insightFile)) {
      const report = fs.readFileSync(insightFile, 'utf-8');
      return res.json({ 
        status: 'completed',
        report,
        generatedAt: fs.statSync(insightFile).mtime
      });
    }
    
    // Check for in-progress insight
    if (fs.existsSync(incompleteFile)) {
      const stats = fs.statSync(incompleteFile);
      const ageMs = Date.now() - stats.mtime.getTime();
      const report = fs.readFileSync(incompleteFile, 'utf-8');
      
      if (ageMs < TIMEOUT_MS) {
        return res.json({
          status: 'generating',
          report,
          startedAt: stats.birthtime,
          lastUpdate: stats.mtime,
          ageMs
        });
      }
      
      // Timed out
      return res.json({
        status: 'timeout',
        report,
        startedAt: stats.birthtime,
        lastUpdate: stats.mtime,
        ageMs
      });
    }
    
    // No insight found
    res.json({ status: 'not_started' });
  } catch (err) {
    console.error('Insight check error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/session/:id/insight', async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const sessionDir = path.join(SESSION_DIR, sessionId);
    const insightFile = path.join(sessionDir, 'insight-report.md');
    const incompleteFile = path.join(sessionDir, 'insight-report.md.incomplete');
    
    let deleted = [];
    
    if (fs.existsSync(insightFile)) {
      fs.unlinkSync(insightFile);
      deleted.push('insight-report.md');
    }
    
    if (fs.existsSync(incompleteFile)) {
      fs.unlinkSync(incompleteFile);
      deleted.push('insight-report.md.incomplete');
    }
    
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('Insight delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/session/:id/export', async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    
    const sessionDir = path.join(SESSION_DIR, sessionId);
    
    if (!fs.existsSync(sessionDir)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Create zip file
    const { spawn } = require('child_process');
    const archiveName = `session-${sessionId}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);
    
    // Use zip to create archive and pipe directly to response
    const zip = spawn('zip', [
      '-r', '-q', '-',  // Recursive, quiet, output to stdout
      sessionId  // Archive this directory
    ], {
      cwd: SESSION_DIR  // Change working directory
    });
    
    zip.stdout.pipe(res);
    
    zip.stderr.on('data', (data) => {
      console.error('zip stderr:', data.toString());
    });
    
    zip.on('close', (code) => {
      if (code !== 0) {
        console.error(`zip process exited with code ${code}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Archive creation failed' });
        }
      }
    });
    
    zip.on('error', (err) => {
      console.error('zip process error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Archive creation failed' });
      }
    });
    
  } catch (err) {
    console.error('Export error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// Configure multer for file upload
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.zip') {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are allowed'));
    }
  }
});

// Import session from zip file
app.post('/session/import', upload.single('sessionZip'), async (req, res) => {
  const { spawn } = require('child_process');
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const uploadedZip = req.file.path;
  const extractDir = path.join(os.tmpdir(), `extract-${Date.now()}`);
  
  try {
    // Create extraction directory
    fs.mkdirSync(extractDir, { recursive: true });
    
    // Extract zip file
    console.log(`Extracting ${uploadedZip} to ${extractDir}...`);
    
    const unzipProcess = spawn('unzip', ['-q', uploadedZip, '-d', extractDir]);
    
    await new Promise((resolve, reject) => {
      unzipProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Unzip failed with code ${code}`));
        }
      });
      
      unzipProcess.on('error', (err) => {
        reject(new Error(`Unzip process error: ${err.message}`));
      });
    });
    
    // Find session directory in extracted content
    const extractedItems = fs.readdirSync(extractDir);
    
    if (extractedItems.length === 0) {
      throw new Error('Empty zip file');
    }
    
    // Look for session directory (should contain events.jsonl)
    let sessionDir = null;
    let sessionId = null;
    
    for (const item of extractedItems) {
      const itemPath = path.join(extractDir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        const eventsFile = path.join(itemPath, 'events.jsonl');
        if (fs.existsSync(eventsFile)) {
          sessionDir = itemPath;
          sessionId = item;
          break;
        }
      }
    }
    
    if (!sessionDir || !sessionId) {
      throw new Error('Invalid session zip: no events.jsonl found');
    }
    
    // Validate session ID format
    if (!isValidSessionId(sessionId)) {
      throw new Error('Invalid session ID format');
    }
    
    // Check if session already exists
    const targetPath = path.join(SESSION_DIR, sessionId);
    if (fs.existsSync(targetPath)) {
      throw new Error(`Session ${sessionId} already exists`);
    }
    
    // Copy session directory to session-state
    console.log(`Importing session ${sessionId}...`);
    
    const copyDir = (src, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src, { withFileTypes: true });
      
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };
    
    copyDir(sessionDir, targetPath);
    
    // Create .imported marker file
    const importedMarkerPath = path.join(targetPath, '.imported');
    fs.writeFileSync(importedMarkerPath, new Date().toISOString());
    
    console.log(`✅ Session ${sessionId} imported successfully`);
    
    // Clean up
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.unlinkSync(uploadedZip);
    
    res.json({
      success: true,
      sessionId,
      message: 'Session imported successfully'
    });
    
  } catch (err) {
    console.error('Import error:', err);
    
    // Clean up on error
    try {
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      if (fs.existsSync(uploadedZip)) {
        fs.unlinkSync(uploadedZip);
      }
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }
    
    res.status(500).json({ error: err.message });
  }
});

