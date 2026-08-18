const Queue = require('bull');
const prisma = require('../config/prisma');
const { getRedisClient } = require('../config/redis');
const { CACHE_KEYS } = require('../utils/constants');
const logger = require('../utils/logger');

const productViewQueue = new Queue('product-view-queue', {
    redis: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT }
});

/**
 * Flush Redis view counts to Database
 */
productViewQueue.process(async () => {
    const redis = getRedisClient();
    const pattern = `${CACHE_KEYS.PRODUCT_VIEWS}*`;
    const keys = await redis.keys(pattern);

    if (keys.length === 0) return;

    logger.info(`Flushing ${keys.length} product view counters to DB...`);

    const updates = [];

    for (const key of keys) {
        const productId = key.split(':')[1];
        const views = await redis.get(key);

        if (productId && views > 0) {
            updates.push({ productId, views: parseInt(views, 10) });
            // Reset counter in Redis
            await redis.set(key, 0);
        }
    }

    if (updates.length > 0) {
        try {
            await prisma.$transaction(
                updates.map(update => prisma.product.update({
                    where: { id: update.productId },
                    data: { views: { increment: update.views } }
                }))
            );
            logger.info(`Successfully flushed ${updates.length} view updates to DB.`);
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
