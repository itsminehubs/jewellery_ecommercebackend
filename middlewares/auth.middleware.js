const ApiError = require('../utils/ApiError');
const { verifyAccessToken, extractTokenFromHeader } = require('../utils/jwt');
const { cacheHelper } = require('../config');
const { CACHE_KEYS, USER_ROLES } = require('../utils/constants');
const User = require('../modules/user/user.model');

/**
 * Authenticate user middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = async (req, res, next) => {
  try {
    // Extract token from header
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      throw ApiError.unauthorized('Access token required');
    }

    // Verify token
    const decoded = verifyAccessToken(token);

    // Check if user exists in cache
    let user = await cacheHelper.get(`${CACHE_KEYS.USER}${decoded.id}`);

    if (!user) {
      // Fetch user from database
      user = await User.findById(decoded.id).select('-password');

      if (!user) {
        throw ApiError.unauthorized('User not found');
      }

      if (!user.isActive) {
        throw ApiError.forbidden('Account is deactivated');
      }

      // Cache user data
      await cacheHelper.set(`${CACHE_KEYS.USER}${decoded.id}`, user, 1800); // 30 minutes
    }

    // Attach user to request
    req.user = typeof user === 'string' ? JSON.parse(user) : user;
    req.token = token;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication middleware
 * Authenticates user if token is provided, but doesn't throw error if not
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      const decoded = verifyAccessToken(token);
      
      // Check cache first
      let user = await cacheHelper.get(`${CACHE_KEYS.USER}${decoded.id}`);

      if (!user) {
        user = await User.findById(decoded.id).select('-password');
        
        if (user && user.isActive) {
          await cacheHelper.set(`${CACHE_KEYS.USER}${decoded.id}`, user, 1800);
        }
      }

      if (user) {
        req.user = typeof user === 'string' ? JSON.parse(user) : user;
        req.token = token;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

/**
 * Check if user is authenticated
 * @param {Object} req - Express request object
 * @returns {boolean}
 */
const isAuthenticated = (req) => {
  return !!req.user;
};

module.exports = {
  authenticate,
  optionalAuth,
  isAuthenticated
};
