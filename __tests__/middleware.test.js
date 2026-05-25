const { requestTimeout, developmentCors, errorHandler, notFoundHandler } = require('../src/server/middleware/common');
const config = require('../src/server/config');

describe('Middleware - common.js', () => {
  describe('requestTimeout', () => {
    it('should set request timeout and call next', () => {
      const req = {
        setTimeout: jest.fn()
      };
      const res = {};
      const next = jest.fn();

      requestTimeout(req, res, next);

      expect(req.setTimeout).toHaveBeenCalledWith(config.REQUEST_TIMEOUT_MS);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('developmentCors', () => {
    const originalEnv = config.NODE_ENV;

    afterEach(() => {
      config.NODE_ENV = originalEnv;
    });

    it('should add CORS headers in development mode for allowed origins', () => {
      config.NODE_ENV = 'development';

      const req = {
        headers: { origin: 'http://localhost:3838' }
      };
      const res = {
        header: jest.fn()
      };
      const next = jest.fn();

      developmentCors(req, res, next);

      expect(res.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:3838');
      expect(res.header).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      expect(res.header).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type');
      expect(next).toHaveBeenCalled();
    });

    it('should add CORS headers for 127.0.0.1 origin', () => {
      config.NODE_ENV = 'development';

      const req = {
        headers: { origin: 'http://127.0.0.1:3838' }
      };
      const res = {
        header: jest.fn()
      };
      const next = jest.fn();

      developmentCors(req, res, next);

      expect(res.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://127.0.0.1:3838');
      expect(next).toHaveBeenCalled();
    });

    it('should not add CORS headers for disallowed origins', () => {
      config.NODE_ENV = 'development';

      const req = {
        headers: { origin: 'http://malicious.com' }
      };
      const res = {
        header: jest.fn()
      };
      const next = jest.fn();

      developmentCors(req, res, next);

      expect(res.header).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should not add CORS headers in production mode', () => {
      config.NODE_ENV = 'production';

      const req = {
        headers: { origin: 'http://localhost:3838' }
      };
      const res = {
        header: jest.fn()
      };
      const next = jest.fn();

      developmentCors(req, res, next);

      expect(res.header).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should handle requests without origin header', () => {
      config.NODE_ENV = 'development';

      const req = {
        headers: {}
      };
      const res = {
        header: jest.fn()
      };
      const next = jest.fn();

      developmentCors(req, res, next);

      expect(res.header).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('errorHandler', () => {
    const originalEnv = config.NODE_ENV;
    let consoleErrorSpy;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      config.NODE_ENV = originalEnv;
      consoleErrorSpy.mockRestore();
    });

    it('should handle errors with default 500 status', () => {
      const err = new Error('Test error');
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled error:', err.stack);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });

    it('should use custom status code if provided', () => {
      const err = new Error('Not found');
      err.status = 404;

      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should include error message and stack in development', () => {
      config.NODE_ENV = 'development';

      const err = new Error('Development error');
      err.stack = 'Error stack trace';

      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Development error',
        stack: 'Error stack trace'
      });
    });

    it('should hide error details in production', () => {
      config.NODE_ENV = 'production';

      const err = new Error('Sensitive error');
      err.stack = 'Sensitive stack trace';

      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error'
      });
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ stack: expect.anything() })
      );
    });

    it('should handle errors when NODE_ENV is not set', () => {
      delete config.NODE_ENV;

      const err = new Error('Test error');
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      // Should default to production-safe behavior
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error'
      });
    });

    it('should handle errors without message', () => {
      const err = new Error();
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });

    it('should handle non-Error objects', () => {
      const err = { message: 'String error' };
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with error message', () => {
      const req = { url: '/nonexistent', method: 'GET' };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      notFoundHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
    });

    it('should handle different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      methods.forEach(method => {
        const req = { url: '/test', method };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };

        notFoundHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
      });
    });

    it('should handle different URLs', () => {
      const urls = ['/api/sessions', '/uploads', '/insights', '/random/path'];

      urls.forEach(url => {
        const req = { url, method: 'GET' };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };

        notFoundHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
      });
    });
  });
});
