const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const { spawn } = require('child_process');
const { isValidSessionId } = require('../utils/helpers');
const { trackEvent, trackException } = require('../telemetry');
const processManager = require('../utils/processManager');
const config = require('../config');
const { registry } = require('../adapters');

class UploadController {
  constructor() {
    this.SESSION_DIR = process.env.SESSION_DIR || path.join(os.homedir(), '.copilot', 'session-state');
    this.uploadDir = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'copilot-session-uploads');

    // Multi-format session directories
    this.SESSION_DIRS = {
      copilot: this.SESSION_DIR,
      claude: path.join(os.homedir(), '.claude', 'projects'),
      'pi-mono': path.join(os.homedir(), '.pi', 'agent', 'sessions')
    };

    // Don't create uploadDir here - multer's DiskStorage will handle it
    // This avoids EEXIST errors when multiple tests run in parallel
    this.upload = this.createMulterInstance();
  }

  createMulterInstance() {
    return multer({
      dest: this.uploadDir,
      limits: { fileSize: config.MAX_UPLOAD_SIZE },
      fileFilter: (req, file, cb) => {
        // Check both file extension and MIME type
        const isZipExtension = file.originalname.toLowerCase().endsWith('.zip');
        const isZipMime = file.mimetype === 'application/zip' ||
                          file.mimetype === 'application/x-zip-compressed';

        if (!isZipExtension || !isZipMime) {
          return cb(new Error('Only .zip files are allowed'));
        }
        cb(null, true);
      }
    });
  }

  // Share session (export as zip)
  async shareSession(req, res) {
    try {
      const sessionId = req.params.id;

      if (!isValidSessionId(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const sessionPath = path.join(this.SESSION_DIR, sessionId);

      try {
        await fs.promises.access(sessionPath);
      } catch (_err) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const zipFile = path.join(os.tmpdir(), `session-${sessionId}.zip`);

      const zipProcess = spawn('zip', ['-r', '-q', zipFile, sessionId], {
        cwd: this.SESSION_DIR
      });

      processManager.register(zipProcess, { name: `zip-${sessionId}` });

      zipProcess.on('close', (code) => {
        if (code !== 0) {
          return res.status(500).json({ error: 'Failed to create zip file' });
        }

        // Track SessionShared event
        trackEvent('SessionShared', { sessionId });

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
  }

  // Import session from zip (with validation)
  async importSession(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const zipPath = req.file.path;
      const extractDir = path.join(this.uploadDir, `extract-${Date.now()}`);
      const uploadedFileSize = (await fs.promises.stat(zipPath)).size;

      await fs.promises.mkdir(extractDir, { recursive: true });
      await this._validateZipArchive(zipPath);

      const unzipProcess = spawn('unzip', ['-q', zipPath, '-d', extractDir]);
      processManager.register(unzipProcess, { name: 'unzip-import' });

      unzipProcess.on('close', async (code) => {
        try {
          await fs.promises.unlink(zipPath).catch(() => {});

          if (code !== 0) {
            await fs.promises.rm(extractDir, { recursive: true, force: true });
            return res.status(500).json({ error: 'Failed to extract zip file' });
          }

          const result = await this._importExtractedSession(extractDir, req);
          await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});

          if (!result.success) {
            const body = { error: result.error };
            if (result.code) body.code = result.code;
            if (result.candidates) body.candidates = result.candidates;
            return res.status(result.statusCode || 500).json(body);
          }

          trackEvent('SessionImported', { format: result.format, fileSize: uploadedFileSize.toString() });
          const body = { success: true, sessionId: result.sessionId, format: result.format };
          if (result.project) body.project = result.project;
          return res.json(body);
        } catch (err) {
          console.error('Error importing session:', err);
          trackException(err, { operation: 'importSession' });
          await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
          return res.status(500).json({ error: 'Error importing session' });
        }
      });

      unzipProcess.on('error', async (err) => {
        console.error('Error extracting zip:', err);
        trackException(err, { operation: 'importSession_unzip' });
        await fs.promises.unlink(zipPath).catch(() => {});
        await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
        return res.status(500).json({ error: 'Failed to extract zip file' });
      });
    } catch (err) {
      console.error('Error processing upload:', err);
      trackException(err, { operation: 'importSession_upload' });
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
      // Surface known validation errors as 400
      if (err.message?.match(/Compressed file too large|Uncompressed size too large|Too many files|Directory nesting too deep|Failed to list zip/)) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Error processing upload' });
    }
  }

  // Multer middleware accessor
  getUploadMiddleware() {
    // Accept both 'zipFile' (canonical) and 'sessionZip' (legacy frontend)
    const fieldNames = ['zipFile', 'sessionZip'];
    const middleware = this.upload.fields(fieldNames.map(name => ({ name, maxCount: 1 })));
    return (req, res, next) => {
      middleware(req, res, (err) => {
        if (err) return next(err);
        req.file = fieldNames.map(n => req.files?.[n]?.[0]).find(Boolean) || null;
        return next();
      });
    };
  }

  /**
   * Detect format via adapter registry. Returns backward-compat shape for _detectFormat,
   * plus structured result via _detectImportCandidates.
   */
  async _detectFormat(extractDir) {
    const det = await this._detectImportCandidates(extractDir);
    if (det.status !== 'matched') return null;
    return { format: det.match.source, extractDir, ...det.match };
  }

  async _detectImportCandidates(extractDir) {
    try {
      const entries = await fs.promises.readdir(extractDir);
      if (entries.length === 0) {
        return { status: 'unsupported-format', matches: [], candidates: [], error: 'Empty zip file' };
      }
      // Path-traversal guard
      if (entries.some(e => e.includes('..') || path.isAbsolute(e))) {
        return { status: 'invalid-structure', matches: [], candidates: [], error: 'Invalid session directory name in zip file' };
      }
      const candidates = await registry.detectImportCandidates(extractDir);
      const matches = candidates.filter(c => c.matched);
      if (matches.length === 0) return { status: 'unsupported-format', matches: [], candidates, error: 'Unsupported session zip format' };
      if (matches.length > 1) return { status: 'ambiguous', matches, candidates, error: 'Ambiguous session zip format' };
      return { status: 'matched', match: matches[0], matches, candidates };
    } catch (err) {
      console.error('Error detecting format:', err);
      return { status: 'error', matches: [], candidates: [], error: 'Error detecting format' };
    }
  }

  async _importCopilotSession(formatInfo, extractDir) {
    return registry.get('copilot').importDetectedSession(formatInfo, { extractDir, req: { query: {} }, targetDir: this.SESSION_DIRS.copilot });
  }
  async _importClaudeSession(formatInfo, extractDir, req) {
    return registry.get('claude').importDetectedSession(formatInfo, { extractDir, req, targetDir: this.SESSION_DIRS.claude });
  }
  async _importPiMonoSession(formatInfo, extractDir, req) {
    return registry.get('pi-mono').importDetectedSession(formatInfo, { extractDir, req, targetDir: this.SESSION_DIRS['pi-mono'] });
  }

  async _importByFormat(formatInfo, extractDir, req) {
    if (!isValidSessionId(formatInfo.sessionId)) {
      return { success: false, error: 'Invalid session ID', statusCode: 400 };
    }
    const adapter = registry.get(formatInfo.format || formatInfo.source);
    if (!adapter) {
      return { success: false, error: `Unsupported format: ${formatInfo.format || formatInfo.source}`, statusCode: 400, code: 'unsupported-format' };
    }
    return adapter.importDetectedSession(formatInfo, { extractDir, req, targetDir: this.SESSION_DIRS[formatInfo.format || formatInfo.source] });
  }

  async _validateZipArchive(zipPath) {
    const MAX_COMPRESSED = 50 * 1024 * 1024, MAX_UNCOMPRESSED = 200 * 1024 * 1024, MAX_FILES = 1000, MAX_DEPTH = 5;
    const stats = await fs.promises.stat(zipPath);
    if (stats.size > MAX_COMPRESSED) throw new Error('Compressed file too large (max 50MB)');
    const listProc = spawn('unzip', ['-l', zipPath]);
    let out = '';
    listProc.stdout.on('data', d => { out += d.toString(); });
    await new Promise((ok, fail) => {
      listProc.on('close', c => c !== 0 ? fail(new Error('Failed to list zip contents')) : ok());
      listProc.on('error', fail);
    });
    let totalSize = 0, count = 0, maxD = 0;
    for (const line of out.split('\n')) {
      const m = line.trim().match(/^\s*(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.+)$/);
      if (!m) continue;
      totalSize += parseInt(m[1], 10); count++;
      maxD = Math.max(maxD, (m[2].match(/\//g) || []).length);
    }
    if (totalSize > MAX_UNCOMPRESSED) throw new Error(`Uncompressed size too large (${Math.round(totalSize/1024/1024)}MB > ${MAX_UNCOMPRESSED/1024/1024}MB)`);
    if (count > MAX_FILES) throw new Error(`Too many files in archive (${count} > ${MAX_FILES})`);
    if (maxD > MAX_DEPTH) throw new Error(`Directory nesting too deep (${maxD} > ${MAX_DEPTH})`);
  }

  async _importExtractedSession(extractDir, req) {
    const det = await this._detectImportCandidates(extractDir);
    if (det.status === 'error') return { success: false, statusCode: 500, error: 'Error importing session' };
    if (det.status === 'invalid-structure') return { success: false, statusCode: 400, error: det.error };
    if (det.status === 'unsupported-format') {
      return { success: false, statusCode: det.error === 'Empty zip file' ? 400 : 415, error: det.error, code: 'unsupported-format', candidates: det.candidates };
    }
    if (det.status === 'ambiguous') {
      return { success: false, statusCode: 400, error: det.error, code: 'ambiguous-format', candidates: det.matches };
    }
    return this._importByFormat(det.match, extractDir, req);
  }

  /**
   * Find session location across all session directories
   * @param {string} sessionId - Session identifier
   * @param {string} preferredSource - Preferred source to search first
   * @returns {Promise<Object|null>} Session location info or null
   */
  async _findSessionLocation(sessionId, preferredSource = null) {
    try {
      // Define search order based on preference
      const sources = preferredSource
        ? [preferredSource, ...Object.keys(this.SESSION_DIRS).filter(s => s !== preferredSource)]
        : Object.keys(this.SESSION_DIRS);

      for (const source of sources) {
        const baseDir = this.SESSION_DIRS[source];

        if (source === 'copilot') {
          // For Copilot, sessions are directly in SESSION_DIR
          const sessionPath = path.join(baseDir, sessionId);
          if (fs.existsSync(sessionPath)) {
            const eventsFile = path.join(sessionPath, 'events.jsonl');
            if (fs.existsSync(eventsFile)) {
              return {
                source: 'copilot',
                sessionId,
                sessionPath,
                baseDir
              };
            }
          }
        } else if (source === 'claude') {
          // For Claude, search in all project directories
          if (fs.existsSync(baseDir)) {
            const projects = await fs.promises.readdir(baseDir);
            for (const project of projects) {
              const projectPath = path.join(baseDir, project);
              const stat = await fs.promises.stat(projectPath);
              if (stat.isDirectory()) {
                const sessionFile = path.join(projectPath, `${sessionId}.jsonl`);
                if (fs.existsSync(sessionFile)) {
                  return {
                    source: 'claude',
                    sessionId,
                    sessionFile,
                    projectPath,
                    project,
                    baseDir
                  };
                }
              }
            }
          }
        } else if (source === 'pi-mono') {
          // For Pi-Mono, search in all project directories for timestamped files
          if (fs.existsSync(baseDir)) {
            const projects = await fs.promises.readdir(baseDir);
            for (const project of projects) {
              const projectPath = path.join(baseDir, project);
              const stat = await fs.promises.stat(projectPath);
              if (stat.isDirectory()) {
                const files = await fs.promises.readdir(projectPath);
                const piMonoPattern = new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z_${sessionId}\\.jsonl$`);
                for (const file of files) {
                  if (piMonoPattern.test(file)) {
                    return {
                      source: 'pi-mono',
                      sessionId,
                      fileName: file,
                      sessionFile: path.join(projectPath, file),
                      projectPath,
                      project,
                      baseDir
                    };
                  }
                }
              }
            }
          }
        }
      }

      return null;
    } catch (err) {
      console.error('Error finding session location:', err);
      return null;
    }
  }
}

module.exports = UploadController;