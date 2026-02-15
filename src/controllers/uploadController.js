const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const { spawn } = require('child_process');
const { isValidSessionId } = require('../utils/helpers');
const processManager = require('../utils/processManager');
const config = require('../config');

class UploadController {
  constructor() {
    this.SESSION_DIR = process.env.SESSION_DIR || path.join(os.homedir(), '.copilot', 'session-state');
    this.uploadDir = path.join(os.tmpdir(), 'copilot-session-uploads');
    this.initializeUploadDir();
    this.upload = this.createMulterInstance();
  }

  initializeUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
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

      await fs.promises.mkdir(extractDir, { recursive: true });

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
          const targetPath = path.join(this.SESSION_DIR, sessionDirName);

          const eventsFile = path.join(sessionPath, 'events.jsonl');
          try {
            await fs.promises.access(eventsFile);
          } catch (_err) {
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
  }

  // Multer middleware accessor
  getUploadMiddleware() {
    return this.upload.single('zipFile');
  }
}

module.exports = UploadController;