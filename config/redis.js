const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Create and configure Redis client
 * @returns {Redis}
 */
const createRedisClient = () => {
  if (redisClient) {
    return redisClient;
  }

  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true
  };

  redisClient = new Redis(redisConfig);

  // Event handlers
  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  redisClient.on('error', (err) => {
    logger.error(`Redis error: ${err.message}`);
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', () => {
    logger.info('Redis client reconnecting');
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await redisClient.quit();
    logger.info('Redis connection closed due to app termination');
  });

  return redisClient;
};

/**
 * Get Redis client instance
 * @returns {Redis}
 */
const getRedisClient = () => {
  if (!redisClient) {
    return createRedisClient();
  }
  return redisClient;
};

/**
 * Cache helper functions
 */
const cacheHelper = {
  /**
   * Set cache with expiration
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} expirationInSeconds - Expiration time in seconds
   * @returns {Promise<string>}
   */
  set: async (key, value, expirationInSeconds = 3600) => {
    const client = getRedisClient();
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    return await client.setex(key, expirationInSeconds, stringValue);
  },

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {Promise<any>}
   */
  get: async (key) => {
    const client = getRedisClient();
    const value = await client.get(key);
    
    if (!value) return null;
    
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },

  /**
   * Delete cache
   * @param {string} key - Cache key
   * @returns {Promise<number>}
   */
  del: async (key) => {
    const client = getRedisClient();
    return await client.del(key);
  },

  /**
   * Delete multiple keys matching pattern
   * @param {string} pattern - Pattern to match keys
   * @returns {Promise<void>}
   */
  delPattern: async (pattern) => {
    const client = getRedisClient();
    const keys = await client.keys(pattern);
    
    if (keys.length > 0) {
      await client.del(...keys);
    }
  },

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<number>}
   */
  exists: async (key) => {
    const client = getRedisClient();
    return await client.exists(key);
  },

  /**
   * Set expiration on key
   * @param {string} key - Cache key
   * @param {number} seconds - Expiration in seconds
   * @returns {Promise<number>}
   */
  expire: async (key, seconds) => {
    const client = getRedisClient();
    return await client.expire(key, seconds);
  }
};

/**
 * Disconnect Redis client
 * @returns {Promise<void>}
 */
const disconnectRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected successfully');
  }
};

module.exports = {
  createRedisClient,
  getRedisClient,
  cacheHelper,
  disconnectRedis
};
