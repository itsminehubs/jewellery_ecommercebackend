const rateLimit = require('express-rate-limit');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Create rate limiter middleware
 * @param {Object} options - Rate limiter options
 * @returns {Function} Rate limiter middleware
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests, please try again later',
    handler: (req, res,next) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        url: req.originalUrl,
        userId: req.user?._id
      });

      return res.status(429).json({
    success: false,
    message: 'Too many requests, please try again later'
  });

    },
    skip: (req) => {
      // Skip rate limiting for admin users in production
     
      return false;
    },
    ...options
  };

  return rateLimit(defaultOptions);
};

/**
 * General API rate limiter
 * 100 requests per 15 minutes
 */
const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});

/**
 * Auth route rate limiter
 * 5 requests per 15 minutes
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true
});

/**
 * OTP rate limiter
 * 3 OTP requests per 5 minutes
 */
const otpLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: 'Too many OTP requests, please try again later',
  skipSuccessfulRequests: false
});

/**
 * Password reset rate limiter
 * 3 requests per hour
 */
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many password reset attempts, please try again later'
});

/**
 * File upload rate limiter
 * 10 uploads per hour
 */
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many file uploads, please try again later'
});

/**
 * Order creation rate limiter
 * 10 orders per hour
 */
const orderLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many order attempts, please try again later'
});

/**
 * Payment rate limiter
 * 5 payment attempts per hour
 */
const paymentLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many payment attempts, please try again later'
});

/**
 * Search rate limiter
 * 50 searches per minute
 */
const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 50,
  message: 'Too many search requests, please slow down'
});

/**
 * Admin action rate limiter
 * 200 requests per 15 minutes
 */
const adminLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many admin actions, please try again later'
});

/**
 * Webhook rate limiter
 * 1000 requests per minute
 */
const webhookLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 1000,
  message: 'Webhook rate limit exceeded',
  skip: () => false // Never skip webhook rate limiting
});

/**
 * Custom rate limiter using Redis (for distributed systems)
 * @param {Object} options - Rate limiter options
 * @returns {Function} Middleware function
 */
const redisRateLimiter = (options = {}) => {
  const { getRedisClient } = require('../config/redis');
  const redis = getRedisClient();

  return async (req, res, next) => {
    try {
      const key = `rate_limit:${options.keyPrefix || 'api'}:${req.ip}`;
      const limit = options.max || 100;
      const windowMs = options.windowMs || 15 * 60 * 1000;
      const windowSeconds = Math.floor(windowMs / 1000);

      // Increment counter
      const current = await redis.incr(key);

      // Set expiration on first request
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }

      // Get TTL
      const ttl = await redis.ttl(key);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current));
      res.setHeader('X-RateLimit-Reset', Date.now() + (ttl * 1000));

      // Check if limit exceeded
      if (current > limit) {
        logger.warn('Rate limit exceeded (Redis)', {
          ip: req.ip,
          url: req.originalUrl,
          userId: req.user?._id
        });

        throw ApiError.tooManyRequests('Too many requests, please try again later');
      }

      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
      } else {
        logger.error('Redis rate limiter error:', error);
        // Continue without rate limiting if Redis fails
        next();
      }
    }
  };
};

module.exports = {
  createRateLimiter,
  apiLimiter,
  authLimiter,
  otpLimiter,
  passwordResetLimiter,
  uploadLimiter,
  orderLimiter,
  paymentLimiter,
  searchLimiter,
  adminLimiter,
  webhookLimiter,
  redisRateLimiter
};
