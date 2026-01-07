require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');
const express = require('express');

const { initializeConfig, cleanup } = require('./config');

const PORT = process.env.PORT;

let server;

/**
 * Start server after initializing configs
 */
const startServer = async () => {
  try {
    // 🔥 Initialize DB, Redis, Razorpay, Cloudinary
    await initializeConfig();

    server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`API URL: http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  if (server) {
    server.close(async () => {
      await cleanup();
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', async (err) => {
  logger.error('Uncaught Exception:', err);
  await cleanup();
  process.exit(1);
});

/**
 * Graceful shutdown (Ctrl+C, PM2, Docker)
 */
process.on('SIGINT', async () => {
  logger.warn('SIGINT received. Shutting down gracefully...');
  if (server) {
    server.close(async () => {
      await cleanup();
      process.exit(0);
    });
  } else {
    await cleanup();
    process.exit(0);
  }
});

process.on('SIGTERM', async () => {
  logger.warn('SIGTERM received. Shutting down gracefully...');
  if (server) {
    server.close(async () => {
      await cleanup();
      process.exit(0);
    });
  } else {
    await cleanup();
    process.exit(0);
  }
});
