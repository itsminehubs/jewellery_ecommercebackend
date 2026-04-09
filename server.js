require('dotenv').config();
const cluster = require('cluster');
const os = require('os');
const app = require('./app');
const logger = require('./utils/logger');
const { initializeConfig, cleanup } = require('./config');

const PORT = process.env.PORT || 8000;
const numCPUs = os.cpus().length;

let server;

/**
 * Start server logic
 */
const startWorker = async () => {
  try {
    // 🔥 Initialize DB, Redis, Razorpay, Cloudinary per worker
    await initializeConfig();

    server = app.listen(PORT, () => {
      logger.info(`🚀 Worker ${process.pid} started on port ${PORT}`);
    });

    handleShutdown(server);
  } catch (error) {
    logger.error(`❌ Worker ${process.pid} failed to start:`, error);
    process.exit(1);
  }
};

/**
 * Handle master-worker clustering logic
 */
if (cluster.isMaster) {
  logger.info(`👑 Master ${process.pid} is running`);

  // Fork workers for each CPU
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`⚠️ Worker ${worker.process.pid} died. Signal: ${signal}. Code: ${code}. Restarting...`);
    cluster.fork();
  });
} else {
  startWorker();
}

/**
 * Centralized Shutdown Logic
 */
function handleShutdown(serverInstance) {
  const gracefulExit = async (signal) => {
    logger.warn(`${signal} received. Worker ${process.pid} shutting down gracefully...`);
    if (serverInstance) {
      serverInstance.close(async () => {
        await cleanup();
        process.exit(0);
      });
    } else {
      await cleanup();
      process.exit(0);
    }
  };

  process.on('SIGINT', () => gracefulExit('SIGINT'));
  process.on('SIGTERM', () => gracefulExit('SIGTERM'));

  process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled Rejection in Worker ${process.pid}:`, err);
    gracefulExit('UNHANDLED_REJECTION');
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception in Worker ${process.pid}:`, err);
    gracefulExit('UNCAUGHT_EXCEPTION');
  });
}
