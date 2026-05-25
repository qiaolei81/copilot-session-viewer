// IMPORTANT: Initialize telemetry FIRST, before any other requires (especially Express)
require('./src/server/telemetry');

const createApp = require('./src/server/app');
const config = require('./src/server/config');
const processManager = require('./src/server/utils/processManager');

// Create the Express app
const app = createApp();

// Export app for testing
module.exports = app;

// Start server only if not being required by tests
if (require.main === module) {
  const server = app.listen(config.PORT, () => {
    console.log(`🚀 Copilot Session Viewer running at http://localhost:${config.PORT}`);
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
}