const ApiError = require('../utils/ApiError');
const { ROLE_PERMISSIONS } = require('../utils/constants');

/**
 * Middleware to check if user has required permission
 * @param {string} permission - Permission to check
 * @returns {Function} Middleware function
 */
const checkPermission = (permission) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const userRole = req.user.role;
      const allowedPermissions = ROLE_PERMISSIONS[userRole] || [];

      if (!allowedPermissions.includes(permission)) {
        throw ApiError.forbidden(`Permission denied: ${permission} required`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user has ANY of the required permissions
 * @param {Array<string>} permissions - Permissions to check
 * @returns {Function} Middleware function
 */
const checkAnyPermission = (permissions) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const userRole = req.user.role;
      const allowedPermissions = ROLE_PERMISSIONS[userRole] || [];

      const hasPermission = permissions.some(p => allowedPermissions.includes(p));

      if (!hasPermission) {
        throw ApiError.forbidden('Permission denied: Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  checkPermission,
  checkAnyPermission
};
