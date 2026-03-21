const authService = require('./auth.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

/**
 * Send OTP to phone
 * @route POST /api/v1/auth/send-otp
 * @access Public
 */
const sendOTP = asyncHandler(async (req, res) => {
  const { phone } = req.body;

  const result = await authService.sendOTP(phone);

  ApiResponse.success(result, result.message).send(res);
});

/**
 * Login with email/phone and password
 * @route POST /api/v1/auth/login
 * @access Public
 */
const login = asyncHandler(async (req, res) => {
  const { phone, email, password } = req.body;
  const identifier = phone || email;

  const result = await authService.login(identifier, password);

  ApiResponse.success(result, result.message).send(res);
});

/**
 * Verify OTP and login/register
 * @route POST /api/v1/auth/verify-otp
 * @access Public
 */
const  verifyOTP = asyncHandler(async (req, res) => {
  const { phone, otp, name, email } = req.body;

  const result = await authService.verifyOTP(phone, otp,name, email);

  ApiResponse.success(result, result.message).send(res);
});

/**
 * Refresh access token
 * @route POST /api/v1/auth/refresh-token
 * @access Public
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  const result = await authService.refreshAccessToken(refreshToken);

  ApiResponse.success(result, result.message).send(res);
});

/**
 * Logout user
 * @route POST /api/v1/auth/logout
 * @access Private
 */
const logout = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { refreshToken } = req.body;

  const result = await authService.logout(userId, refreshToken);

  ApiResponse.success(result, result.message).send(res);
});

/**
 * Check if phone exists
 * @route POST /api/v1/auth/check-phone
 * @access Public
 */
const checkPhone = asyncHandler(async (req, res) => {
  const { phone } = req.body;

  const result = await authService.checkPhoneExists(phone);

  ApiResponse.success(result, 'Phone check completed').send(res);
});

/**
 * Get current user
 * @route GET /api/v1/auth/me
 * @access Private
 */
const getCurrentUser = asyncHandler(async (req, res) => {
  ApiResponse.success(req.user, 'User fetched successfully').send(res);
});

/**
 * Verify credentials for POS Override
 * @route POST /api/v1/auth/verify-pos-override
 * @access Private/Public (Staff only)
 */
const verifyPOSOverride = asyncHandler(async (req, res) => {
  const { phone, email, password } = req.body;
  const result = await authService.verifyPOSOverride(phone || email, password);
  ApiResponse.success(result, result.message).send(res);
});

/**
 * Forgot password (send OTP)
 * @route POST /api/v1/auth/forgot-password
 * @access Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { phone, email } = req.body;
  const result = await authService.forgotPassword(phone || email);
  ApiResponse.success(result, 'OTP sent to your registered phone number').send(res);
});

/**
 * Reset password
 * @route POST /api/v1/auth/reset-password
 * @access Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { phone, otp, newPassword } = req.body;
  const result = await authService.resetPassword(phone, otp, newPassword);
  ApiResponse.success(result, result.message).send(res);
});

module.exports = {
  sendOTP,
  verifyOTP,
  login,
  refreshToken,
  logout,
  checkPhone,
  getCurrentUser,
  verifyPOSOverride,
  forgotPassword,
  resetPassword
};
