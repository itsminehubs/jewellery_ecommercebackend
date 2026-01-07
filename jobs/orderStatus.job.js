const Queue = require('bull');
const logger = require('../utils/logger');

const orderStatusQueue = new Queue('order-status-queue', {
  redis: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT }
});

orderStatusQueue.process(async (job) => {
  const { orderId, status } = job.data;
  logger.info(`Processing order status update: ${orderId} -> ${status}`);
  
  // Add notification logic here
  // Send email, SMS, push notification etc.
  
  return { processed: true };
});

const notifyOrderStatus = async (orderId, status) => {
  await orderStatusQueue.add({ orderId, status });
};

module.exports = { orderStatusQueue, notifyOrderStatus };