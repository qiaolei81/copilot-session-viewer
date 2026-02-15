/**
 * Process Manager - Track and cleanup spawned processes
 */

class ProcessManager {
  constructor() {
    this.activeProcesses = new Set();
    this.isShuttingDown = false;
    this._setupCleanupHandlers();
  }

  /**
   * Register a new process for tracking
   * @param {ChildProcess} process - The spawned process
   * @param {Object} metadata - Optional metadata for logging
   */
  register(process, metadata = {}) {
    const processInfo = { process, metadata, startTime: Date.now() };
    this.activeProcesses.add(processInfo);
    
    process.on('exit', () => {
      this.activeProcesses.delete(processInfo);
      const duration = Date.now() - processInfo.startTime;
      console.log(`🔄 Process exited (${metadata.name || 'unknown'}): ${duration}ms`);
    });
    
    return processInfo;
  }

  /**
   * Kill all active processes
   */
  killAll() {
    console.log(`🛑 Killing ${this.activeProcesses.size} active processes...`);
    
    for (const { process, metadata } of this.activeProcesses) {
      try {
        if (!process.killed) {
          process.kill('SIGTERM');
          console.log(`  ✓ Killed ${metadata.name || process.pid}`);
        }
      } catch (err) {
        console.error(`  ✗ Failed to kill ${metadata.name || process.pid}:`, err.message);
      }
    }
    
    this.activeProcesses.clear();
  }

  /**
   * Get count of active processes
   */
  getActiveCount() {
    return this.activeProcesses.size;
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   */
  _setupCleanupHandlers() {
    const cleanup = (signal, exitCode = 0) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      
      console.log(`\n📛 Received ${signal}, shutting down gracefully...`);
      this.killAll();
      
      // Give processes time to exit
      setTimeout(() => {
        process.exit(exitCode);
      }, 1000);
    };

    process.on('SIGTERM', () => cleanup('SIGTERM', 0));
    process.on('SIGINT', () => cleanup('SIGINT', 0));
    
    // Handle uncaught errors with error exit code
    process.on('uncaughtException', (err) => {
      console.error('💥 Uncaught exception:', err);
      cleanup('uncaughtException', 1);
    });
  }
}

module.exports = new ProcessManager();
