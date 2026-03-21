const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const authValidation = require('./auth.validation');
const { authenticate } = require('../../middlewares/auth.middleware');
const { otpLimiter, authLimiter } = require('../../middlewares/rateLimiter.middleware');
const validate = require('../../middlewares/validate.middleware');

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login with email/phone and password
 * @access  Public
 */
router.post(
  '/login',
  authLimiter,
  authController.login
);

/**
 * @route   POST /api/v1/auth/send-otp
 * @desc    Send OTP to phone number
 * @access  Public
 */
router.post(
  '/send-otp',
  otpLimiter,
  validate(authValidation.sendOTP),
  authController.sendOTP
);

/**
 * @route   POST /api/v1/auth/verify-otp
 * @desc    Verify OTP and login/register
 * @access  Public
 */
router.post(
  '/verify-otp',
  authLimiter,
  validate(authValidation.verifyOTP),
  authController.verifyOTP
);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  '/refresh-token',
  validate(authValidation.refreshToken),
  authController.refreshToken
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post(
  '/logout',
  authenticate,
  validate(authValidation.logout),
  authController.logout
);

/**
 * @route   POST /api/v1/auth/check-phone
 * @desc    Check if phone number exists
 * @access  Public
 */
router.post(
  '/check-phone',
  validate(authValidation.sendOTP),
  authController.checkPhone
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current logged in user
 * @access  Private
 */
router.get(
  '/me',
  authenticate,
  authController.getCurrentUser
);

/**
 * @route   POST /api/v1/auth/verify-pos-override
 * @desc    Verify credentials for POS billing override
 * @access  Public (Check inside controller)
 */
router.post(
  '/verify-pos-override',
  authLimiter,
  authController.verifyPOSOverride
);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Forgot password (send OTP)
 * @access  Public
 */
router.post(
  '/forgot-password',
  authLimiter,
  authController.forgotPassword
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password
 * @access  Public
 */
router.post(
  '/reset-password',
  authLimiter,
  authController.resetPassword
);

module.exports = router;
