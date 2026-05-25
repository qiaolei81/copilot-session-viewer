const { EventEmitter } = require('events');

describe('ProcessManager', () => {
  let processManager;
  let exitSpy;
  let setTimeoutSpy;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    // Clear module cache to get fresh instance
    jest.resetModules();

    // Mock console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.exit
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    // Mock setTimeout
    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
      fn(); // Execute immediately for tests
      return 123;
    });

    // Require fresh instance after mocking
    processManager = require('../src/server/utils/processManager');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
    setTimeoutSpy.mockRestore();

    // Clear active processes
    processManager.activeProcesses.clear();
    processManager.isShuttingDown = false;
  });

  describe('constructor', () => {
    it('should initialize with empty activeProcesses set', () => {
      expect(processManager.activeProcesses).toBeInstanceOf(Set);
      expect(processManager.activeProcesses.size).toBe(0);
    });

    it('should initialize with isShuttingDown as false', () => {
      expect(processManager.isShuttingDown).toBe(false);
    });
  });

  describe('register', () => {
    it('should register a process and return processInfo', () => {
      const mockProcess = new EventEmitter();
      const metadata = { name: 'test-process' };

      const processInfo = processManager.register(mockProcess, metadata);

      expect(processInfo).toBeDefined();
      expect(processInfo.process).toBe(mockProcess);
      expect(processInfo.metadata).toBe(metadata);
      expect(processInfo.startTime).toBeGreaterThan(0);
      expect(processManager.activeProcesses.has(processInfo)).toBe(true);
      expect(processManager.activeProcesses.size).toBe(1);
    });

    it('should handle process with metadata containing name', () => {
      const mockProcess = new EventEmitter();
      const metadata = { name: 'copilot-insight' };

      processManager.register(mockProcess, metadata);

      expect(processManager.activeProcesses.size).toBe(1);
    });

    it('should handle process without metadata', () => {
      const mockProcess = new EventEmitter();

      const processInfo = processManager.register(mockProcess);

      expect(processInfo.metadata).toEqual({});
      expect(processManager.activeProcesses.size).toBe(1);
    });

    it('should remove process from set when it exits', () => {
      const mockProcess = new EventEmitter();
      const metadata = { name: 'exit-test' };

      processManager.register(mockProcess, metadata);
      expect(processManager.activeProcesses.size).toBe(1);

      // Simulate process exit
      mockProcess.emit('exit');

      expect(processManager.activeProcesses.size).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Process exited (exit-test)')
      );
    });

    it('should log duration when process exits', () => {
      const mockProcess = new EventEmitter();
      const metadata = { name: 'duration-test' };

      processManager.register(mockProcess, metadata);
      mockProcess.emit('exit');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Process exited \(duration-test\): \d+ms/)
      );
    });

    it('should handle process exit with unknown name', () => {
      const mockProcess = new EventEmitter();

      processManager.register(mockProcess);
      mockProcess.emit('exit');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Process exited (unknown)')
      );
    });
  });

  describe('killAll', () => {
    it('should kill all active processes', () => {
      const mockProcess1 = { kill: jest.fn(), killed: false, pid: 123 };
      const mockProcess2 = { kill: jest.fn(), killed: false, pid: 456 };

      processManager.activeProcesses.add({
        process: mockProcess1,
        metadata: { name: 'process-1' },
        startTime: Date.now()
      });
      processManager.activeProcesses.add({
        process: mockProcess2,
        metadata: { name: 'process-2' },
        startTime: Date.now()
      });

      processManager.killAll();

      expect(mockProcess1.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockProcess2.kill).toHaveBeenCalledWith('SIGTERM');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Killing 2 active processes')
      );
      expect(processManager.activeProcesses.size).toBe(0);
    });

    it('should not kill already killed processes', () => {
      const mockProcess = { kill: jest.fn(), killed: true, pid: 123 };

      processManager.activeProcesses.add({
        process: mockProcess,
        metadata: { name: 'already-killed' },
        startTime: Date.now()
      });

      processManager.killAll();

      expect(mockProcess.kill).not.toHaveBeenCalled();
    });

    it('should handle kill errors gracefully', () => {
      const mockProcess = {
        kill: jest.fn(() => { throw new Error('Kill failed'); }),
        killed: false,
        pid: 123
      };

      processManager.activeProcesses.add({
        process: mockProcess,
        metadata: { name: 'error-process' },
        startTime: Date.now()
      });

      processManager.killAll();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to kill error-process'),
        'Kill failed'
      );
      expect(processManager.activeProcesses.size).toBe(0);
    });

    it('should log process name when killing', () => {
      const mockProcess = { kill: jest.fn(), killed: false, pid: 123 };

      processManager.activeProcesses.add({
        process: mockProcess,
        metadata: { name: 'named-process' },
        startTime: Date.now()
      });

      processManager.killAll();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Killed named-process')
      );
    });

    it('should log process PID when name is not available', () => {
      const mockProcess = { kill: jest.fn(), killed: false, pid: 999 };

      processManager.activeProcesses.add({
        process: mockProcess,
        metadata: {},
        startTime: Date.now()
      });

      processManager.killAll();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Killed 999')
      );
    });

    it('should clear activeProcesses set after killing all', () => {
      const mockProcess1 = { kill: jest.fn(), killed: false, pid: 123 };
      const mockProcess2 = { kill: jest.fn(), killed: false, pid: 456 };

      processManager.activeProcesses.add({
        process: mockProcess1,
        metadata: {},
        startTime: Date.now()
      });
      processManager.activeProcesses.add({
        process: mockProcess2,
        metadata: {},
        startTime: Date.now()
      });

      expect(processManager.activeProcesses.size).toBe(2);
      processManager.killAll();
      expect(processManager.activeProcesses.size).toBe(0);
    });
  });

  describe('getActiveCount', () => {
    it('should return 0 when no processes are active', () => {
      expect(processManager.getActiveCount()).toBe(0);
    });

    it('should return correct count of active processes', () => {
      const mockProcess1 = new EventEmitter();
      const mockProcess2 = new EventEmitter();
      const mockProcess3 = new EventEmitter();

      processManager.register(mockProcess1);
      expect(processManager.getActiveCount()).toBe(1);

      processManager.register(mockProcess2);
      expect(processManager.getActiveCount()).toBe(2);

      processManager.register(mockProcess3);
      expect(processManager.getActiveCount()).toBe(3);
    });

    it('should return updated count after process exits', () => {
      const mockProcess1 = new EventEmitter();
      const mockProcess2 = new EventEmitter();

      processManager.register(mockProcess1);
      processManager.register(mockProcess2);
      expect(processManager.getActiveCount()).toBe(2);

      mockProcess1.emit('exit');
      expect(processManager.getActiveCount()).toBe(1);

      mockProcess2.emit('exit');
      expect(processManager.getActiveCount()).toBe(0);
    });
  });

  describe('_setupCleanupHandlers - SIGTERM', () => {
    it('should handle SIGTERM signal', () => {
      // Reset and get fresh instance to capture listeners
      jest.resetModules();
      const freshProcessManager = require('../src/server/utils/processManager');

      const mockProcess = { kill: jest.fn(), killed: false, pid: 123 };
      freshProcessManager.activeProcesses.add({
        process: mockProcess,
        metadata: { name: 'sigterm-test' },
        startTime: Date.now()
      });

      // Emit SIGTERM
      process.emit('SIGTERM');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGTERM')
      );
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should not run cleanup twice on subsequent SIGTERM', () => {
      jest.resetModules();
      const freshProcessManager = require('../src/server/utils/processManager');

      freshProcessManager.isShuttingDown = false;

      // First SIGTERM
      process.emit('SIGTERM');
      expect(freshProcessManager.isShuttingDown).toBe(true);

      consoleLogSpy.mockClear();
      exitSpy.mockClear();

      // Second SIGTERM should be ignored
      process.emit('SIGTERM');
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Received SIGTERM')
      );
    });
  });

  describe('_setupCleanupHandlers - SIGINT', () => {
    it('should handle SIGINT signal (Ctrl+C)', () => {
      jest.resetModules();
      const freshProcessManager = require('../src/server/utils/processManager');

      const mockProcess = { kill: jest.fn(), killed: false, pid: 456 };
      freshProcessManager.activeProcesses.add({
        process: mockProcess,
        metadata: { name: 'sigint-test' },
        startTime: Date.now()
      });

      // Emit SIGINT
      process.emit('SIGINT');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGINT')
      );
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('_setupCleanupHandlers - uncaughtException', () => {
    it('should handle uncaught exceptions', () => {
      jest.resetModules();
      const freshProcessManager = require('../src/server/utils/processManager');

      const mockProcess = { kill: jest.fn(), killed: false, pid: 789 };
      freshProcessManager.activeProcesses.add({
        process: mockProcess,
        metadata: { name: 'exception-test' },
        startTime: Date.now()
      });

      const testError = new Error('Test uncaught exception');

      // Emit uncaughtException
      process.emit('uncaughtException', testError);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '💥 Uncaught exception:',
        testError
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received uncaughtException')
      );
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(exitSpy).toHaveBeenCalledWith(1); // Error exit code
    });

    it('should exit with code 1 on uncaught exception', () => {
      jest.resetModules();
      require('../src/server/utils/processManager');

      process.emit('uncaughtException', new Error('Fatal error'));

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('cleanup handler timeout', () => {
    it('should call setTimeout with 1000ms delay', () => {
      setTimeoutSpy.mockRestore();
      const realSetTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(() => {});

      jest.resetModules();
      require('../src/server/utils/processManager');

      process.emit('SIGTERM');

      expect(realSetTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
      realSetTimeoutSpy.mockRestore();
    });
  });
});
