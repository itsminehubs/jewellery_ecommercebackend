const Queue = require('bull');
const logger = require('../../utils/logger');

const orderQueue = new Queue('order-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

orderQueue.process(async (job) => {
  logger.info(`Processing order: ${job.data.orderId}`);
  // Process order logic here
  return { processed: true };
});

orderQueue.on('completed', (job) => {
  logger.info(`Order processed: ${job.data.orderId}`);
});

orderQueue.on('failed', (job, err) => {
  logger.error(`Order processing failed: ${job.data.orderId}`, err);
});

module.exports = orderQueue;