const Joi = require('joi');
const { REGEX_PATTERNS } = require('../../utils/constants');

/**
 * Validation for sending OTP
 */
const sendOTP = {
  body: Joi.object({
    phone: Joi.string()
      .pattern(REGEX_PATTERNS.PHONE)
      .required()
      .messages({
        'string.pattern.base': 'Please provide a valid 10-digit Indian mobile number',
        'any.required': 'Phone number is required'
      })
  })
};

/**
 * Validation for verifying OTP and login
 */
const verifyOTP = {
  body: Joi.object({
    phone: Joi.string()
      .pattern(REGEX_PATTERNS.PHONE)
      .required()
      .messages({
        'string.pattern.base': 'Please provide a valid 10-digit Indian mobile number',
        'any.required': 'Phone number is required'
      }),
    otp: Joi.string()
      .length(6)
      .pattern(/^[0-9]+$/)
      .required()
      .messages({
        'string.length': 'OTP must be exactly 6 digits',
        'string.pattern.base': 'OTP must contain only numbers',
        'any.required': 'OTP is required'
      }),
    name: Joi.string()
      .trim()
      .min(2)
      .max(100)
      .optional()
      .messages({
        'string.min': 'Name must be at least 2 characters long',
        'string.max': 'Name cannot exceed 100 characters'
      }),
    email: Joi.string()
      .email()
      .optional()
      .messages({
        'string.email': 'Please provide a valid email address'
      })
  })
};

/**
 * Validation for refresh token
 */
const refreshToken = {
  body: Joi.object({
    refreshToken: Joi.string()
      .required()
      .messages({
        'any.required': 'Refresh token is required'
      })
  })
};

/**
 * Validation for logout
 */
const logout = {
  body: Joi.object({
    refreshToken: Joi.string()
      .optional()
  })
};

module.exports = {
  sendOTP,
  verifyOTP,
  refreshToken,
  logout
};
