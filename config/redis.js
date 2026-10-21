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
 * In-memory fallback cache when Redis is unavailable or in read-only/MISCONF state
 */
const memoryStore = new Map();

// Periodic cleanup of expired keys in memory store
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of memoryStore.entries()) {
    if (item.expiresAt && item.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref();

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
 * Cache helper functions with automatic in-memory fallback
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
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    // Always store in memory fallback
    const expiresAt = expirationInSeconds > 0 ? Date.now() + (expirationInSeconds * 1000) : null;
    memoryStore.set(key, { value: stringValue, expiresAt });

    // Attempt to persist in Redis if available
    try {
      const client = getRedisClient();
      if (client && (client.status === 'ready' || client.status === 'connect')) {
        await client.setex(key, expirationInSeconds, stringValue);
      }
    } catch (error) {
      logger.warn(`Redis set failed for key "${key}", retained in memory fallback: ${error.message}`);
    }

    return 'OK';
  },

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {Promise<any>}
   */
  get: async (key) => {
    let value = null;

    // Try Redis first
    try {
      const client = getRedisClient();
      if (client && (client.status === 'ready' || client.status === 'connect')) {
        value = await client.get(key);
      }
    } catch (error) {
      logger.warn(`Redis get failed for key "${key}", falling back to memory: ${error.message}`);
    }

    // Fallback to memory store if Redis returned null or failed
    if (value === null || value === undefined) {
      if (memoryStore.has(key)) {
        const entry = memoryStore.get(key);
        if (!entry.expiresAt || entry.expiresAt > Date.now()) {
          value = entry.value;
        } else {
          memoryStore.delete(key);
        }
      }
    }

    if (value === null || value === undefined) return null;

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
    memoryStore.delete(key);

    try {
      const client = getRedisClient();
      if (client && (client.status === 'ready' || client.status === 'connect')) {
        return await client.del(key);
      }
    } catch (error) {
      logger.warn(`Redis del failed for key "${key}": ${error.message}`);
    }
    return 1;
  },

  /**
   * Delete multiple keys matching pattern
   * @param {string} pattern - Pattern to match keys
   * @returns {Promise<void>}
   */
  delPattern: async (pattern) => {
    try {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      for (const key of memoryStore.keys()) {
        if (regex.test(key)) {
          memoryStore.delete(key);
        }
      }
    } catch {
      // Ignore regex parsing errors
    }

    try {
      const client = getRedisClient();
      if (client && (client.status === 'ready' || client.status === 'connect')) {
        const keys = await client.keys(pattern);
        if (keys.length > 0) {
          await client.del(...keys);
        }
      }
    } catch (error) {
      logger.warn(`Redis delPattern failed for pattern "${pattern}": ${error.message}`);
    }
  },

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<number>}
   */
  exists: async (key) => {
    try {
      const client = getRedisClient();
      if (client && (client.status === 'ready' || client.status === 'connect')) {
        return await client.exists(key);
      }
    } catch (error) {
      logger.warn(`Redis exists failed for key "${key}": ${error.message}`);
    }

    if (memoryStore.has(key)) {
      const entry = memoryStore.get(key);
      if (!entry.expiresAt || entry.expiresAt > Date.now()) {
        return 1;
      }
      memoryStore.delete(key);
    }
    return 0;
  },

  /**
   * Set expiration on key
   * @param {string} key - Cache key
   * @param {number} seconds - Expiration in seconds
   * @returns {Promise<number>}
   */
  expire: async (key, seconds) => {
    if (memoryStore.has(key)) {
      const entry = memoryStore.get(key);
      entry.expiresAt = Date.now() + (seconds * 1000);
    }

    try {
      const client = getRedisClient();
      if (client && (client.status === 'ready' || client.status === 'connect')) {
        return await client.expire(key, seconds);
      }
    } catch (error) {
      logger.warn(`Redis expire failed for key "${key}": ${error.message}`);
    }
    return 1;
  },

  /**
   * Increment value of key
   * @param {string} key - Cache key
   * @param {number} amount - Amount to increment
   * @returns {Promise<number>}
   */
  increment: async (key, amount = 1) => {
    let currentVal = 0;
    if (memoryStore.has(key)) {
      const entry = memoryStore.get(key);
      currentVal = parseInt(entry.value, 10) || 0;
    }
    const newVal = currentVal + amount;
    memoryStore.set(key, { value: String(newVal), expiresAt: null });

    try {
      const client = getRedisClient();
      if (client && (client.status === 'ready' || client.status === 'connect')) {
        return await client.incrby(key, amount);
      }
    } catch (error) {
      logger.warn(`Redis increment failed for key "${key}": ${error.message}`);
    }

    return newVal;
  }
};

/**
 * Disconnect Redis client
 * @returns {Promise<void>}
 */
const disconnectRedis = async () => {
  if (redisClient) {
    try {
      if (redisClient.status !== 'end') {
        await redisClient.quit();
      }
    } catch (error) {
      logger.warn(`Error disconnecting Redis: ${error.message}`);
    } finally {
      redisClient = null;
      logger.info('Redis disconnected successfully');
    }
  }
};

module.exports = {
  createRedisClient,
  getRedisClient,
  cacheHelper,
  disconnectRedis
};
