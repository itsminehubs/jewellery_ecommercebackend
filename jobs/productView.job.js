const Queue = require('bull');
const Product = require('../modules/product/product.model');
const { getRedisClient } = require('../config/redis');
const { CACHE_KEYS } = require('../utils/constants');
const logger = require('../utils/logger');

const productViewQueue = new Queue('product-view-queue', {
    redis: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT }
});

/**
 * Flush Redis view counts to MongoDB
 */
productViewQueue.process(async () => {
    const redis = getRedisClient();
    const pattern = `${CACHE_KEYS.PRODUCT_VIEWS}*`;
    const keys = await redis.keys(pattern);

    if (keys.length === 0) return;

    logger.info(`Flushing ${keys.length} product view counters to DB...`);

    const bulkOps = [];

    for (const key of keys) {
        const productId = key.split(':')[1];
        const views = await redis.get(key);

        if (productId && views > 0) {
            bulkOps.push({
                updateOne: {
                    filter: { _id: productId },
                    update: { $inc: { views: parseInt(views) } }
                }
            });
            // Reset counter in Redis after adding to bulk ops
            await redis.set(key, 0);
        }
    }

    if (bulkOps.length > 0) {
        try {
            await Product.bulkWrite(bulkOps);
            logger.info(`Successfully flushed ${bulkOps.length} view updates to DB.`);
        } catch (error) {
            logger.error(`Failed to flush product views: ${error.message}`);
        }
    }
});

/**
 * Schedule the job to run every 5 minutes
 */
const startViewFlushingJob = async () => {
    // Remove existing repeatable jobs to avoid duplicates
    const repeatableJobs = await productViewQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        if (job.name === 'flush-views') {
            await productViewQueue.removeRepeatableByKey(job.key);
        }
    }

    await productViewQueue.add({}, {
        jobId: 'flush-views',
        repeat: { cron: '*/5 * * * *' } // Every 5 minutes
    });
};

module.exports = { startViewFlushingJob };
