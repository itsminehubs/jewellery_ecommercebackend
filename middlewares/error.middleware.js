const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Convert non-ApiError errors to ApiError
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorConverter = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';
    error = new ApiError(statusCode, message, false, err.stack);
  }

  next(error);
};

/**
 * Handle errors and send response
 * @param {ApiError} err - API Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;

  // Set default values
  statusCode = statusCode || 500;
  message = message || 'Internal server error';

  // Log error
  if (statusCode >= 500) {
    logger.error('Server Error:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?._id
    });
  } else {
    logger.warn('Client Error:', {
      message: err.message,
      url: req.originalUrl,
      method: req.method,
      statusCode,
      userId: req.user?._id
    });
  }

  // Prepare error response
  const response = {
    success: false,
    message,
    
  };

  res.status(statusCode).json(response);
};

/**
 * Handle 404 errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const notFound = (req, res, next) => {
  const error = ApiError.notFound(`Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * Handle Mongoose validation errors
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleValidationError = (err, req, res, next) => {
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    const error = ApiError.badRequest(errors.join(', '));
    return next(error);
  }

  if (err.name === 'CastError') {
    const error = ApiError.badRequest(`Invalid ${err.path}: ${err.value}`);
    return next(error);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    const error = ApiError.conflict(`${field} already exists`);
    return next(error);
  }

  next(err);
};

/**
 * Handle async errors
 * @param {Function} fn - Async function
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle JWT errors
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleJWTError = (err, req, res, next) => {
  if (err.name === 'JsonWebTokenError') {
    const error = ApiError.unauthorized('Invalid token');
    return next(error);
  }

  if (err.name === 'TokenExpiredError') {
    const error = ApiError.unauthorized('Token has expired');
    return next(error);
  }

  next(err);
};

/**
 * Handle multer errors
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleMulterError = (err, req, res, next) => {
  if (err.name === 'MulterError') {
    let message = 'File upload error';

    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size too large';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    }

    const error = ApiError.badRequest(message);
    return next(error);
  }

  next(err);
};

module.exports = {
  errorConverter,
  errorHandler,
  notFound,
  handleValidationError,
  asyncHandler,
  handleJWTError,
  handleMulterError
};
