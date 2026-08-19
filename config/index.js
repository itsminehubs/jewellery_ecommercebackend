
const { createRedisClient, getRedisClient, cacheHelper, disconnectRedis } = require('./redis');
const { initializeRazorpay, getRazorpayInstance } = require('./razorpay');
const { initializeCloudinary } = require('./s3');
const { startViewFlushingJob } = require('../jobs/productView.job');

/**
 * Initialize all configurations
 * @returns {Promise<void>}
 */
const initializeConfig = async () => {


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

  await disconnectRedis();
};

module.exports = {
  initializeConfig,
  cleanup,
  getRedisClient,
  cacheHelper,
  getRazorpayInstance
};
