const jwt = require('jsonwebtoken');
const ApiError = require('./ApiError');
const logger = require('./logger');

/**
 * Generate JWT access token
 * @param {string} userId - User ID
 * @param {string} role - User role
 * @returns {string} JWT token
 */
const generateAccessToken = (userId, role = 'user') => {
  try {
    const payload = {
      id: userId,
      role,
      type: 'access'
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m',
        issuer: 'jewelry-ecommerce-api'
      }
    );

    return token;
  } catch (error) {
    logger.error(`Error generating access token: ${error.message}`);
    throw ApiError.internal('Failed to generate access token');
  }
};

/**
 * Generate JWT refresh token
 * @param {string} userId - User ID
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (userId) => {
  try {
    const payload = {
      id: userId,
      type: 'refresh'
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_REFRESH_SECRET,
      { 
        expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d',
        issuer: 'jewelry-ecommerce-api'
      }
    );

    return token;
  } catch (error) {
    logger.error(`Error generating refresh token: ${error.message}`);
    throw ApiError.internal('Failed to generate refresh token');
  }
};

/**
 * Generate both access and refresh tokens
 * @param {string} userId - User ID
 * @param {string} role - User role
 * @returns {Object} Object containing access and refresh tokens
 */
const generateTokens = (userId, role = 'user') => {
  const accessToken = generateAccessToken(userId, role);
  const refreshToken = generateRefreshToken(userId);

  return {
    accessToken,
    refreshToken
  };
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @param {string} type - Token type ('access' or 'refresh')
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token, type = 'access') => {
  try {
    const secret = type === 'refresh' 
      ? process.env.JWT_REFRESH_SECRET 
      : process.env.JWT_SECRET;

    const decoded = jwt.verify(token, secret);

    // Verify token type
    if (decoded.type !== type) {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Token has expired');
    }
    
    if (error.name === 'JsonWebTokenError') {
      throw ApiError.unauthorized('Invalid token');
    }

    logger.error(`Error verifying token: ${error.message}`);
    throw ApiError.unauthorized('Token verification failed');
  }
};

/**
 * Verify access token
 * @param {string} token - JWT access token
 * @returns {Object} Decoded token payload
 */
const verifyAccessToken = (token) => {
  return verifyToken(token, 'access');
};

/**
 * Verify refresh token
 * @param {string} token - JWT refresh token
 * @returns {Object} Decoded token payload
 */
const verifyRefreshToken = (token) => {
  return verifyToken(token, 'refresh');
};

/**
 * Decode token without verification
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    logger.error(`Error decoding token: ${error.message}`);
    throw ApiError.unauthorized('Invalid token format');
  }
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};

/**
 * Get token expiration time
 * @param {string} token - JWT token
 * @returns {Date|null} Expiration date or null
 */
const getTokenExpiration = (token) => {
  try {
    const decoded = decodeToken(token);
    
    if (decoded && decoded.exp) {
      return new Date(decoded.exp * 1000);
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} True if expired
 */
const isTokenExpired = (token) => {
  const expiration = getTokenExpiration(token);
  
  if (!expiration) {
    return true;
  }

  return expiration < new Date();
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  verifyToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  extractTokenFromHeader,
  getTokenExpiration,
  isTokenExpired
};
