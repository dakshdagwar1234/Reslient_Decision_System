const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/database');
const { seedDefaultWorkflow } = require('./scripts/seed');
const RetryWorker = require('./engine/RetryWorker');

let retryWorkerInstance = null;

const startServer = async () => {
  console.log('[Bootstrap] Initializing Resilient Decision System server...');

  // Attempt DB connection in a non-blocking manner
  await connectDB().then(async (conn) => {
    if (conn) {
      await seedDefaultWorkflow();
      retryWorkerInstance = new RetryWorker();
      retryWorkerInstance.start();
    }
  }).catch(err => {
    console.warn(`[Bootstrap] Notice: Database connection attempt returned: ${err.message}. Server continues to serve health checks.`);
  });

  const server = app.listen(env.PORT, () => {
    console.log(`[Bootstrap] Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
    console.log(`[Bootstrap] Health endpoint: http://localhost:${env.PORT}/health`);
    console.log(`[Bootstrap] API v1 Base: http://localhost:${env.PORT}/api/v1`);
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal) => {
    console.log(`\n[Shutdown] Received ${signal}. Closing HTTP server, retry worker, and database connections...`);
    if (retryWorkerInstance) {
      retryWorkerInstance.stop();
    }
    server.close(async () => {
      console.log('[Shutdown] HTTP server closed.');
      await disconnectDB();
      console.log('[Shutdown] Database connection closed.');
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      console.error('[Shutdown] Forceful shutdown initiated after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return server;
};

if (require.main === module) {
  startServer();
}

module.exports = { startServer };

