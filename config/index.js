const { connectDB, disconnectDB } = require('./db');
const { createRedisClient, getRedisClient, cacheHelper, disconnectRedis } = require('./redis');
const { initializeRazorpay, getRazorpayInstance } = require('./razorpay');
const { initializeCloudinary } = require('./cloudinary');
const { startViewFlushingJob } = require('../jobs/productView.job');

/**
 * Initialize all configurations
 * @returns {Promise<void>}
 */
const initializeConfig = async () => {
  // Connect to MongoDB
  await connectDB();

  // Initialize Redis
  createRedisClient();

  // Initialize Razorpay
  initializeRazorpay();

  // Initialize Cloudinary
  initializeCloudinary();

  // Start Background jobs
  await startViewFlushingJob();
};

/**
 * Cleanup all connections
 * @returns {Promise<void>}
 */
const cleanup = async () => {
  await disconnectDB();
  await disconnectRedis();
};

module.exports = {
  initializeConfig,
  cleanup,
  getRedisClient,
  cacheHelper,
  getRazorpayInstance
};
