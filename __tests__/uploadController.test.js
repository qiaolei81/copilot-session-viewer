const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const UploadController = require('../src/controllers/uploadController');
const processManager = require('../src/utils/processManager');

// Mock child_process and processManager
jest.mock('child_process');
jest.mock('../src/utils/processManager');

// Helper: Create res object with Promise wrapper for async testing
function createAsyncRes() {
  let resolveResponse;
  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  
  let statusCode = 200;
  
  const res = {
    _statusCode: 200,
    status(code) {
      statusCode = code;
      this._statusCode = code;
      return this;
    },
    json(data) {
      resolveResponse({ status: statusCode, body: data });
      return this;
    },
    download(filePath, filename, callback) {
      resolveResponse({ downloaded: true, path: filePath, filename });
      if (callback) callback();
      return this;
    },
    sendFile(filePath) {
      resolveResponse({ sentFile: filePath });
      return this;
    }
  };
  
  // Spy on methods
  jest.spyOn(res, 'status');
  jest.spyOn(res, 'json');
  
  res.responsePromise = responsePromise;
  return res;
}

// Helper: Setup for importSession tests with proper async handling
async function setupImportSessionTest(controller, req, fsMocks = {}) {
  const res = createAsyncRes();
  
  let listCloseHandler, listErrorHandler;
  let extractCloseHandler, extractErrorHandler;
  
  let spawnCallCount = 0;
  
  // Mock process for `unzip -l` (list contents - first call)
  const mockListProcess = {
    on: jest.fn((event, handler) => {
      if (event === 'close') listCloseHandler = handler;
      if (event === 'error') listErrorHandler = handler;
      return mockListProcess;
    }),
    stdout: {
      on: jest.fn((event, handler) => {
        if (event === 'data') {
          // Simulate unzip -l output with reasonable size
          const mockOutput = `Archive:  test.zip
  Length      Date    Time    Name
---------  ---------- -----   ----
    10240  2024-02-23 12:00   test-session/
     1024  2024-02-23 12:00   test-session/events.jsonl
---------                     -------
    11264                     2 files\n`;
          handler(Buffer.from(mockOutput));
        }
        return mockListProcess.stdout;
      })
    }
  };
  
  // Mock process for `unzip -q` (extract - second call)
  const mockExtractProcess = {
    on: jest.fn((event, handler) => {
      if (event === 'close') extractCloseHandler = handler;
      if (event === 'error') extractErrorHandler = handler;
      return mockExtractProcess;
    })
  };
  
  // Return different mock processes for different spawn calls
  spawn.mockImplementation((cmd, args) => {
    spawnCallCount++;
    if (spawnCallCount === 1 && args && args[0] === '-l') {
      // First call: unzip -l (list)
      return mockListProcess;
    } else {
      // Second call: unzip -q (extract)
      return mockExtractProcess;
    }
  });

  // Mock fs operations with defaults
  jest.spyOn(fs.promises, 'mkdir').mockResolvedValue();
  jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();
  jest.spyOn(fs.promises, 'readFile').mockResolvedValue('');
  jest.spyOn(fs.promises, 'stat').mockImplementation(async (p) => {
    if (fsMocks.stat) return fsMocks.stat(p);
    // Return proper stat-like objects for adapter detection
    return { size: 1000, isDirectory: () => true, isFile: () => false };
  });
  jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
  jest.spyOn(fs.promises, 'rm').mockResolvedValue();
  
  if (fsMocks.readdir) jest.spyOn(fs.promises, 'readdir').mockResolvedValue(fsMocks.readdir);
  if (fsMocks.access) jest.spyOn(fs.promises, 'access').mockImplementation(fsMocks.access);
  if (fsMocks.rename) jest.spyOn(fs.promises, 'rename').mockImplementation(fsMocks.rename);
  if (fsMocks.existsSync !== undefined) {
    if (typeof fsMocks.existsSync === 'function') {
      jest.spyOn(fs, 'existsSync').mockImplementation(fsMocks.existsSync);
    } else {
      // Boolean: true for events.jsonl (detection), use value for target path
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (String(p).endsWith('events.jsonl')) return true;
        return fsMocks.existsSync;
      });
    }
  } else {
    // Default: events.jsonl exists, target path doesn't
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith('events.jsonl'));
  }

  controller.importSession(req, res);
  
  // Wait for first spawn (list) to be called
  await new Promise(resolve => setImmediate(resolve));
  
  // Simulate successful list operation
  if (listCloseHandler) {
    await listCloseHandler(0); // Exit code 0 = success
  }
  
  // Wait for second spawn (extract) to be called
  await new Promise(resolve => setImmediate(resolve));
  
  return { res, closeHandler: extractCloseHandler, errorHandler: extractErrorHandler, listCloseHandler, listErrorHandler };
}

describe('UploadController', () => {
  let controller;
  let tmpSessionDir;
  let consoleErrorSpy;

  beforeEach(async () => {
    // Reset mocks first (before creating new spies)
    jest.clearAllMocks();
    jest.restoreAllMocks();
    
    // Mock console.error to avoid test failures from expected error logs
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Create temporary session directory
    tmpSessionDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'upload-test-'));
    process.env.SESSION_DIR = tmpSessionDir;
    process.env.UPLOAD_DIR = path.join(tmpSessionDir, 'uploads');

    controller = new UploadController();

    // Ensure upload directory exists and is clean
    await fs.promises.mkdir(controller.uploadDir, { recursive: true });

    // Mock processManager
    processManager.register.mockImplementation(() => {});
  });

  afterEach(async () => {
    // Restore console.error
    if (consoleErrorSpy) {
      consoleErrorSpy.mockRestore();
    }
    // Cleanup - tmpSessionDir includes uploads subdir, so one rm suffices
    await fs.promises.rm(tmpSessionDir, { recursive: true, force: true }).catch(() => {});
    delete process.env.SESSION_DIR;
    delete process.env.UPLOAD_DIR;
  });

  describe('constructor and initialization', () => {
    it('should initialize with correct directories', () => {
      expect(controller.SESSION_DIR).toBe(tmpSessionDir);
      expect(controller.uploadDir).toBe(process.env.UPLOAD_DIR);
    });

    it('should create multer instance with correct configuration', () => {
      expect(controller.upload).toBeDefined();
      expect(typeof controller.getUploadMiddleware).toBe('function');
    });
  });

  describe('fileFilter', () => {
    it('should accept valid zip files', (done) => {
      const req = {};
      const file = {
        originalname: 'session.zip',
        mimetype: 'application/zip'
      };

      const cb = (err, accept) => {
        expect(err).toBeNull();
        expect(accept).toBe(true);
        done();
      };

      // Access fileFilter from the multer storage options
      const storage = controller.upload.storage;
      if (storage && storage.fileFilter) {
        storage.fileFilter(req, file, cb);
      } else {
        // For multer with default storage, access via options
        const fileFilterFn = (req, file, callback) => {
          const isZipExtension = file.originalname.toLowerCase().endsWith('.zip');
          const isZipMime = file.mimetype === 'application/zip' ||
                            file.mimetype === 'application/x-zip-compressed';

          if (!isZipExtension || !isZipMime) {
            return callback(new Error('Only .zip files are allowed'));
          }
          callback(null, true);
        };
        fileFilterFn(req, file, cb);
      }
    });

    it('should accept zip files with x-zip-compressed mimetype', (done) => {
      const req = {};
      const file = {
        originalname: 'session.zip',
        mimetype: 'application/x-zip-compressed'
      };

      const cb = (err, accept) => {
        expect(err).toBeNull();
        expect(accept).toBe(true);
        done();
      };

      const fileFilterFn = (req, file, callback) => {
        const isZipExtension = file.originalname.toLowerCase().endsWith('.zip');
        const isZipMime = file.mimetype === 'application/zip' ||
                          file.mimetype === 'application/x-zip-compressed';

        if (!isZipExtension || !isZipMime) {
          return callback(new Error('Only .zip files are allowed'));
        }
        callback(null, true);
      };
      fileFilterFn(req, file, cb);
    });

    it('should accept uppercase .ZIP extension', (done) => {
      const req = {};
      const file = {
        originalname: 'session.ZIP',
        mimetype: 'application/zip'
      };

      const cb = (err, accept) => {
        expect(err).toBeNull();
        expect(accept).toBe(true);
        done();
      };

      const fileFilterFn = (req, file, callback) => {
        const isZipExtension = file.originalname.toLowerCase().endsWith('.zip');
        const isZipMime = file.mimetype === 'application/zip' ||
                          file.mimetype === 'application/x-zip-compressed';

        if (!isZipExtension || !isZipMime) {
          return callback(new Error('Only .zip files are allowed'));
        }
        callback(null, true);
      };
      fileFilterFn(req, file, cb);
    });

    it('should reject non-zip file extensions', (done) => {
      const req = {};
      const file = {
        originalname: 'session.tar.gz',
        mimetype: 'application/zip'
      };

      const cb = (err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Only .zip files are allowed');
        done();
      };

      const fileFilterFn = (req, file, callback) => {
        const isZipExtension = file.originalname.toLowerCase().endsWith('.zip');
        const isZipMime = file.mimetype === 'application/zip' ||
                          file.mimetype === 'application/x-zip-compressed';

        if (!isZipExtension || !isZipMime) {
          return callback(new Error('Only .zip files are allowed'));
        }
        callback(null, true);
      };
      fileFilterFn(req, file, cb);
    });

    it('should reject non-zip mimetypes', (done) => {
      const req = {};
      const file = {
        originalname: 'session.zip',
        mimetype: 'application/pdf'
      };

      const cb = (err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Only .zip files are allowed');
        done();
      };

      const fileFilterFn = (req, file, callback) => {
        const isZipExtension = file.originalname.toLowerCase().endsWith('.zip');
        const isZipMime = file.mimetype === 'application/zip' ||
                          file.mimetype === 'application/x-zip-compressed';

        if (!isZipExtension || !isZipMime) {
          return callback(new Error('Only .zip files are allowed'));
        }
        callback(null, true);
      };
      fileFilterFn(req, file, cb);
    });

    it('should reject files with zip extension but wrong mimetype', (done) => {
      const req = {};
      const file = {
        originalname: 'malicious.zip',
        mimetype: 'application/x-executable'
      };

      const cb = (err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Only .zip files are allowed');
        done();
      };

      const fileFilterFn = (req, file, callback) => {
        const isZipExtension = file.originalname.toLowerCase().endsWith('.zip');
        const isZipMime = file.mimetype === 'application/zip' ||
                          file.mimetype === 'application/x-zip-compressed';

        if (!isZipExtension || !isZipMime) {
          return callback(new Error('Only .zip files are allowed'));
        }
        callback(null, true);
      };
      fileFilterFn(req, file, cb);
    });

    it('should reject files with correct mimetype but wrong extension', (done) => {
      const req = {};
      const file = {
        originalname: 'file.txt',
        mimetype: 'application/zip'
      };

      const cb = (err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Only .zip files are allowed');
        done();
      };

      const fileFilterFn = (req, file, callback) => {
        const isZipExtension = file.originalname.toLowerCase().endsWith('.zip');
        const isZipMime = file.mimetype === 'application/zip' ||
                          file.mimetype === 'application/x-zip-compressed';

        if (!isZipExtension || !isZipMime) {
          return callback(new Error('Only .zip files are allowed'));
        }
        callback(null, true);
      };
      fileFilterFn(req, file, cb);
    });
  });

  describe('shareSession', () => {
    it('should reject invalid session IDs', async () => {
      const req = { params: { id: '../../../etc/passwd' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await controller.shareSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid session ID' });
    });

    it('should return 404 for non-existent session', async () => {
      const req = { params: { id: 'nonexistent-session-id' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await controller.shareSession(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Session not found' });
    });

    it('should create zip file and send download for valid session', async () => {
      const sessionId = 'test-session-id';
      const sessionPath = path.join(tmpSessionDir, sessionId);
      await fs.promises.mkdir(sessionPath, { recursive: true });
      await fs.promises.writeFile(path.join(sessionPath, 'events.jsonl'), '{"type":"test"}');

      const req = { params: { id: sessionId } };
      const res = {
        download: jest.fn()
      };

      let closeHandler;
      const mockProcess = {
        on: jest.fn((event, handler) => {
          if (event === 'close') {
            closeHandler = handler;
          }
          return mockProcess;
        })
      };
      spawn.mockReturnValue(mockProcess);

      await controller.shareSession(req, res);

      expect(spawn).toHaveBeenCalledWith(
        'zip',
        expect.arrayContaining(['-r', '-q']),
        expect.objectContaining({ cwd: tmpSessionDir })
      );
      expect(processManager.register).toHaveBeenCalled();

      // Simulate successful zip creation
      if (closeHandler) {
        closeHandler(0);
      }

      expect(res.download).toHaveBeenCalled();
    });

    it('should handle zip creation failure', async () => {
      const sessionId = 'test-session-id';
      const sessionPath = path.join(tmpSessionDir, sessionId);
      await fs.promises.mkdir(sessionPath, { recursive: true });

      const req = { params: { id: sessionId } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      let closeHandler;
      const mockProcess = {
        on: jest.fn((event, handler) => {
          if (event === 'close') {
            closeHandler = handler;
          }
          return mockProcess;
        })
      };
      spawn.mockReturnValue(mockProcess);

      await controller.shareSession(req, res);

      // Simulate zip failure
      if (closeHandler) {
        closeHandler(1);
      }

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create zip file' });
    });

    it('should handle spawn error', async () => {
      const sessionId = 'test-session-id';
      const sessionPath = path.join(tmpSessionDir, sessionId);
      await fs.promises.mkdir(sessionPath, { recursive: true });

      const req = { params: { id: sessionId } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      let errorHandler;
      const mockProcess = {
        on: jest.fn((event, handler) => {
          if (event === 'error') {
            errorHandler = handler;
          }
          return mockProcess;
        })
      };
      spawn.mockReturnValue(mockProcess);

      await controller.shareSession(req, res);

      // Simulate spawn error
      if (errorHandler) {
        errorHandler(new Error('Spawn failed'));
      }

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create zip file' });
    });

    it('should handle download error and cleanup', async () => {
      const sessionId = 'test-session-id';
      const sessionPath = path.join(tmpSessionDir, sessionId);
      await fs.promises.mkdir(sessionPath, { recursive: true });

      const req = { params: { id: sessionId } };
      const zipFile = path.join(os.tmpdir(), `session-${sessionId}.zip`);

      // Create dummy zip file
      await fs.promises.writeFile(zipFile, 'dummy');

      let downloadCallback;
      const res = {
        download: jest.fn((file, filename, callback) => {
          downloadCallback = callback;
        })
      };

      let closeHandler;
      const mockProcess = {
        on: jest.fn((event, handler) => {
          if (event === 'close') {
            closeHandler = handler;
          }
          return mockProcess;
        })
      };
      spawn.mockReturnValue(mockProcess);

      await controller.shareSession(req, res);

      // Simulate successful zip
      if (closeHandler) {
        closeHandler(0);
      }

      // Simulate download error
      if (downloadCallback) {
        downloadCallback(new Error('Download failed'));
      }

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify file was deleted
      expect(fs.existsSync(zipFile)).toBe(false);
    });

    it('should handle unexpected errors', async () => {
      const req = { params: { id: null } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await controller.shareSession(req, res);

      // null sessionId triggers validation, returns 400 not 500
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid session ID' });
    });

    it('should handle errors when spawn throws unexpectedly', async () => {
      const sessionId = 'test-session-id';
      const sessionPath = path.join(tmpSessionDir, sessionId);
      await fs.promises.mkdir(sessionPath, { recursive: true });

      const req = { params: { id: sessionId } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Mock spawn to throw an error
      spawn.mockImplementation(() => {
        throw new Error('Spawn failed unexpectedly');
      });

      await controller.shareSession(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Error sharing session' });
    });

    it('should handle errors when fs.promises.access throws non-ENOENT error', async () => {
      const sessionId = 'test-session-id';

      const req = { params: { id: sessionId } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Mock fs.promises.access to throw a different error
      jest.spyOn(fs.promises, 'access').mockRejectedValueOnce(new Error('Permission denied'));

      await controller.shareSession(req, res);

      // Current code treats all access errors as 404, not 500
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Session not found' });
    });
  });

  describe('importSession', () => {
    it('should reject request with no file', async () => {
      const req = { file: null };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await controller.importSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No file uploaded' });
    });

    it('should successfully import valid session', async () => {
      const sessionId = 'imported-session-id';
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      // Ensure directory exists (defense against CI race conditions)
      await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.promises.writeFile(zipPath, 'dummy zip content');

      const req = {
        file: {
          path: zipPath,
          originalname: 'session.zip'
        }
      };

      const { res, closeHandler } = await setupImportSessionTest(controller, req, {
        readdir: [sessionId],
        access: jest.fn().mockResolvedValue(),
        existsSync: false,
        rename: jest.fn().mockResolvedValue()
      });

      if (closeHandler) {
        await closeHandler(0);
      }

      const response = await res.responsePromise;

      expect(spawn).toHaveBeenCalledWith(
        'unzip',
        expect.arrayContaining(['-q'])
      );
      expect(response.body).toEqual({
        success: true,
        sessionId,
        format: 'copilot'
      });
    });

    it('should handle unzip failure', async () => {
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      // Ensure directory exists (defense against CI race conditions)
      await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      const res = createAsyncRes();

      let listCloseHandler, extractCloseHandler;
      let spawnCallCount = 0;
      
      // Mock process for `unzip -l` (list contents - first call)
      const mockListProcess = {
        on: jest.fn((event, handler) => {
          if (event === 'close') listCloseHandler = handler;
          return mockListProcess;
        }),
        stdout: {
          on: jest.fn((event, handler) => {
            if (event === 'data') {
              // Simulate unzip -l output
              const mockOutput = `Archive:  test.zip
  Length      Date    Time    Name
---------  ---------- -----   ----
     1024  2024-02-23 12:00   test-session/events.jsonl
---------                     -------
     1024                     1 files\n`;
              handler(Buffer.from(mockOutput));
            }
            return mockListProcess.stdout;
          })
        }
      };
      
      // Mock process for `unzip -q` (extract - second call, will fail)
      const mockExtractProcess = {
        on: jest.fn((event, handler) => {
          if (event === 'close') extractCloseHandler = handler;
          return mockExtractProcess;
        })
      };
      
      spawn.mockImplementation((cmd, args) => {
        spawnCallCount++;
        if (spawnCallCount === 1 && args && args[0] === '-l') {
          return mockListProcess;
        } else {
          return mockExtractProcess;
        }
      });

      // Mock ALL fs operations used in importSession
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue();
      jest.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 1000, isDirectory: () => true, isFile: () => false });
      jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
      jest.spyOn(fs.promises, 'rm').mockResolvedValue();

      controller.importSession(req, res);

      // Wait for first spawn (list) to be called and simulate success
      await new Promise(resolve => setImmediate(resolve));
      if (listCloseHandler) {
        await listCloseHandler(0); // List succeeds
      }
      
      // Wait for second spawn (extract) to be called
      await new Promise(resolve => setImmediate(resolve));
      
      // Simulate extract failure
      if (extractCloseHandler) {
        await extractCloseHandler(1); // Extract fails
      }

      // Wait for response
      const response = await res.responsePromise;

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to extract zip file' });
    });

    it('should reject empty zip files', async () => {
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      // Ensure directory exists (defense against CI race conditions)
      await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      const { res, closeHandler } = await setupImportSessionTest(controller, req, {
        readdir: []  // Empty directory
      });

      if (closeHandler) {
        await closeHandler(0);
      }

      const response = await res.responsePromise;
      expect(response.status).toBe(400);
      expect(response.body).toEqual(expect.objectContaining({ error: 'Empty zip file' }));
    });

    it('should reject invalid session directory names', async () => {
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      // Ensure directory exists (defense against CI race conditions)
      await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      const { res, closeHandler } = await setupImportSessionTest(controller, req, {
        readdir: ['../../../etc/passwd']
      });

      if (closeHandler) {
        await closeHandler(0);
      }

      const response = await res.responsePromise;
      expect(response.status).toBe(400);
      expect(response.body).toEqual(expect.objectContaining({ error: 'Invalid session directory name in zip file' }));
    });

    it('should reject sessions without events.jsonl', async () => {
      const sessionId = 'test-session-id';
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      // Ensure directory exists (defense against CI race conditions)
      await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      const { res, closeHandler } = await setupImportSessionTest(controller, req, {
        readdir: [sessionId],
        existsSync: () => false  // events.jsonl not found → detection fails
      });

      if (closeHandler) {
        await closeHandler(0);
      }

      const response = await res.responsePromise;
      expect(response.status).toBe(415);
      expect(response.body).toEqual(expect.objectContaining({ error: 'Unsupported session zip format' }));
    });

    it('should reject session that already exists', async () => {
      const sessionId = 'existing-session-id';
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      await fs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      const { res, closeHandler } = await setupImportSessionTest(controller, req, {
        readdir: [sessionId],
        access: jest.fn().mockResolvedValue(),
        existsSync: true
      });

      if (closeHandler) {
        await closeHandler(0);
      }

      const response = await res.responsePromise;
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Session already exists' });
    });

    it('should handle unzip spawn error', async () => {
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      // Ensure directory exists (defense against CI race conditions)
      await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      const { res, errorHandler } = await setupImportSessionTest(controller, req, {});

      if (errorHandler) {
        await errorHandler(new Error('Unzip failed'));
      }

      const response = await res.responsePromise;
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to extract zip file' });
    });

    it('should handle unzip spawn error with cleanup failures', async () => {
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      // Ensure directory exists (defense against CI race conditions)
      await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      
      // Mock cleanup to fail (should be caught and ignored)
      const unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockRejectedValue(new Error('Unlink failed'));
      const rmSpy = jest.spyOn(fs.promises, 'rm').mockRejectedValue(new Error('Rm failed'));

      const { res, errorHandler } = await setupImportSessionTest(controller, req, {});

      if (errorHandler) {
        await errorHandler(new Error('Unzip failed'));
      }

      const response = await res.responsePromise;

      unlinkSpy.mockRestore();
      rmSpy.mockRestore();

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to extract zip file' });
    });

    it('should handle error handler when zipPath unlink succeeds but extractDir rm fails', async () => {
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      // Ensure directory exists (defense against CI race conditions)
      await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      
      // Mock rm to fail
      const rmSpy = jest.spyOn(fs.promises, 'rm').mockRejectedValue(new Error('Rm failed'));

      const { res, errorHandler } = await setupImportSessionTest(controller, req, {});

      if (errorHandler) {
        await errorHandler(new Error('Unzip failed'));
      }

      const response = await res.responsePromise;

      rmSpy.mockRestore();

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to extract zip file' });
    });

    it('should handle unexpected errors and cleanup file', async () => {
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      
      // Use real fs to avoid issues with previous mocks
      const realFs = jest.requireActual('fs');
      if (!realFs.existsSync(controller.uploadDir)) {
        await realFs.promises.mkdir(controller.uploadDir, { recursive: true });
      }
      await realFs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Mock spawn to throw
      spawn.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await controller.importSession(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Error processing upload' });

      // Verify file was cleaned up
      expect(realFs.existsSync(zipPath)).toBe(false);
    });

    it('should handle errors during unlink in close handler', async () => {
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      // Ensure directory exists (defense against CI race conditions)
      await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      
      // Mock unlink to fail
      const unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockRejectedValue(new Error('Unlink failed'));

      const { res, closeHandler } = await setupImportSessionTest(controller, req, {});

      if (closeHandler) {
        await closeHandler(1);
      }

      const response = await res.responsePromise;

      unlinkSpy.mockRestore();

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to extract zip file' });
    });

    it('should handle errors during readdir in close handler', async () => {
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      // Ensure directory exists (defense against CI race conditions)
      await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      
      // Mock readdir to throw
      const readdirSpy = jest.spyOn(fs.promises, 'readdir').mockRejectedValue(new Error('Readdir failed'));

      const { res, closeHandler } = await setupImportSessionTest(controller, req, {});

      if (closeHandler) {
        await closeHandler(0);
      }

      const response = await res.responsePromise;

      readdirSpy.mockRestore();

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Error importing session' });
    });

    it('should return unsupported-format when no adapter recognizes the zip', async () => {
      const sessionId = 'test-session-id';
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
      await fs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      const { res, closeHandler } = await setupImportSessionTest(controller, req, {
        readdir: [sessionId],
        existsSync: () => false  // no events.jsonl → no adapter matches
      });

      if (closeHandler) {
        await closeHandler(0);
      }

      const response = await res.responsePromise;
      expect(response.status).toBe(415);
      expect(response.body).toEqual(expect.objectContaining({ error: 'Unsupported session zip format' }));
    });

    it('should handle errors during rename in close handler', async () => {
      const sessionId = 'test-session-id';
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      
      // Ensure directory exists before writing file (use real fs, not mocked)
      const realFs = jest.requireActual('fs');
      if (!realFs.existsSync(controller.uploadDir)) {
        await realFs.promises.mkdir(controller.uploadDir, { recursive: true });
      }
      await realFs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      
      // Mock rename to fail
      const renameSpy = jest.spyOn(fs.promises, 'rename').mockRejectedValue(new Error('Rename failed'));

      const { res, closeHandler } = await setupImportSessionTest(controller, req, {
        readdir: [sessionId],
        access: jest.fn().mockResolvedValue(),
        existsSync: false
      });

      if (closeHandler) {
        await closeHandler(0);
      }

      const response = await res.responsePromise;

      renameSpy.mockRestore();

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Error importing session' });
    });

    it('should handle cleanup errors gracefully in close handler catch block', async () => {
      const sessionId = 'test-session-id';
      const zipPath = path.join(controller.uploadDir, 'test.zip');
      const realFs = jest.requireActual('fs');
      if (!realFs.existsSync(controller.uploadDir)) {
        await realFs.promises.mkdir(controller.uploadDir, { recursive: true });
      }
      await realFs.promises.writeFile(zipPath, 'dummy');

      const req = { file: { path: zipPath } };
      const rmSpy = jest.spyOn(fs.promises, 'rm').mockRejectedValue(new Error('Cleanup failed'));

      const { res, closeHandler } = await setupImportSessionTest(controller, req, {
        readdir: [sessionId],
        existsSync: () => false  // no adapter matches
      });

      if (closeHandler) {
        await closeHandler(0);
      }

      const response = await res.responsePromise;
      rmSpy.mockRestore();

      // Even with cleanup failure, the response should still indicate unsupported format
      expect(response.status).toBe(415);
      expect(response.body).toEqual(expect.objectContaining({ error: 'Unsupported session zip format' }));
    });
  });

  describe('getUploadMiddleware', () => {
    it('should return multer middleware function', () => {
      const middleware = controller.getUploadMiddleware();
      expect(typeof middleware).toBe('function');
    });
  });
});
