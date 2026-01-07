const ApiError = require('../utils/ApiError');
const { USER_ROLES } = require('../utils/constants');

/**
 * Check if user is admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const isAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    if (req.user.role !== USER_ROLES.ADMIN) {
      throw ApiError.forbidden('Admin access required');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user has specific role
 * @param {Array<string>} allowedRoles - Array of allowed roles
 * @returns {Function} Middleware function
 */
const hasRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      if (!allowedRoles.includes(req.user.role)) {
        throw ApiError.forbidden('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user can access their own resource or is admin
 * @param {string} paramName - Name of route parameter containing user ID
 * @returns {Function} Middleware function
 */
const isOwnerOrAdmin = (paramName = 'userId') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const resourceUserId = req.params[paramName] || req.body[paramName];

      if (req.user.role !== USER_ROLES.ADMIN && req.user._id.toString() !== resourceUserId) {
        throw ApiError.forbidden('Access denied');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user owns the resource
 * @param {Function} getResourceOwnerId - Function to get resource owner ID from request
 * @returns {Function} Middleware function
 */
const isResourceOwner = (getResourceOwnerId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const ownerId = await getResourceOwnerId(req);

      if (!ownerId) {
        throw ApiError.notFound('Resource not found');
      }

      if (req.user._id.toString() !== ownerId.toString()) {
        throw ApiError.forbidden('Access denied');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  isAdmin,
  hasRole,
  isOwnerOrAdmin,
  isResourceOwner
};
