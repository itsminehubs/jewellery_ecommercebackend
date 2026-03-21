const twilio = require('twilio');
const User = require('../user/user.model');
const ApiError = require('../../utils/ApiError');
const { generateOTP } = require('../../utils/hash');
const { generateTokens, verifyRefreshToken } = require('../../utils/jwt');
const { cacheHelper } = require('../../config');
const { CACHE_KEYS, CACHE_TTL, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../../utils/constants');
const logger = require('../../utils/logger');

// Initialize Twilio client
// const twilioClient = twilio(
//   process.env.TWILIO_ACCOUNT_SID,
//   process.env.TWILIO_AUTH_TOKEN
// );

/**
 * Send OTP to phone number
 * @param {string} phone - Phone number
 * @returns {Promise<Object>}
 */
const sendOTP = async (phone) => {
  try {
    // Generate 6-digit OTP
    const otp = generateOTP(6);

    // Store OTP in Redis with 5-minute expiration
    const otpKey = `${CACHE_KEYS.OTP}${phone}`;
    await cacheHelper.set(otpKey, otp, CACHE_TTL.OTP);

    // In development, log OTP
    logger.info(`Development OTP for ${phone}: ${otp}`);
    console.log(`\n🔐 OTP for ${phone}: ${otp}\n`);
    return {
      message: SUCCESS_MESSAGES.OTP_SENT,
      phone,
      otp: process.env.NODE_ENV === 'development' ? otp : undefined
    };
  } catch (error) {
    logger.error(`Error sending OTP: ${error.message}`);
    throw ApiError.internal('Failed to send OTP');
  }
};

/**
 * Verify OTP and login/register user
 * @param {string} phone - Phone number
 * @param {string} otp - OTP to verify
 * @param {string} name - User name (optional, for new users)
 * @param {string} email - User email (optional)
 * @returns {Promise<Object>}
 */
const verifyOTP = async (phone, otp, name = null, email = null) => {
  try {
    const otpKey = `${CACHE_KEYS.OTP}${phone}`;
    const storedOTP = await cacheHelper.get(otpKey);

    if (!storedOTP) {
      throw ApiError.badRequest('OTP expired or invalid');
    }

    if (String(storedOTP) !== String(otp)) {
      throw ApiError.badRequest(ERROR_MESSAGES.INVALID_OTP);
    }

    await cacheHelper.del(otpKey);

    let user = await User.findByPhone(phone);
    let isNewUser = false;
    const now = new Date();

    if (!user) {
      user = new User({
        phone,
        name: name || `User${phone.slice(-4)}`,
        email: email || null,
        isPhoneVerified: true,
        lastLogin: now
      });
      isNewUser = true;
    } else {
      if (user.isLocked) throw ApiError.forbidden('Account is temporarily locked');
      if (!user.isActive) throw ApiError.forbidden('Account is deactivated');

      user.isPhoneVerified = true;
      user.lastLogin = now;

      if (name && !user.name) user.name = name;
      if (email && !user.email) user.email = email;
    }

    // Generate tokens
    const tokens = generateTokens(user._id.toString(), user.role);

    user.refreshToken = tokens.refreshToken;
    await user.save();

    // ✅ CACHE CLEAN JSON
    await cacheHelper.set(
      `${CACHE_KEYS.USER}${user._id}`,
      JSON.stringify(user.toJSON()),
      CACHE_TTL.MEDIUM
    );

    await cacheHelper.set(
      `${CACHE_KEYS.REFRESH_TOKEN}${user._id}`,
      tokens.refreshToken,
      7 * 24 * 60 * 60
    );

    const userResponse = user.toJSON();
    delete userResponse.refreshToken;

    return {
      message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
      user: userResponse,
      tokens,
      isNewUser
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;

    logger.error(`Error verifying OTP: ${error.message}`);
    throw ApiError.internal('Failed to verify OTP');
  }
};

/**
 * Login user with phone/email and password
 * @param {string} phoneOrEmail - Phone or Email
 * @param {string} password - Password
 * @returns {Promise<Object>}
 */
const login = async (phoneOrEmail, password) => {
  try {
    // Find user by phone or email
    let user = await User.findOne({
      $or: [
        { phone: phoneOrEmail },
        { email: phoneOrEmail.toLowerCase() }
      ]
    }).select('+password');

    if (!user) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Account is deactivated');
    }

    if (user.isLocked) {
      throw ApiError.forbidden('Account is temporarily locked');
    }

    // Check password
    if (!user.password) {
      // If user exists but has no password (e.g. OTP only), they must set one or use OTP
      throw ApiError.badRequest('Please use OTP login or set a password first');
    }

    const isMatch = await user.isPasswordMatch(password);
    if (!isMatch) {
      await user.incLoginAttempts();
      throw ApiError.unauthorized('Invalid credentials');
    }

    // Reset attempts on success
    await user.resetLoginAttempts();

    // Update last login
    user.lastLogin = new Date();
    
    // Generate tokens
    const tokens = generateTokens(user._id.toString(), user.role);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Cache user data
    await cacheHelper.set(
      `${CACHE_KEYS.USER}${user._id}`,
      JSON.stringify(user.toJSON()),
      CACHE_TTL.MEDIUM
    );

    await cacheHelper.set(
      `${CACHE_KEYS.REFRESH_TOKEN}${user._id}`,
      tokens.refreshToken,
      7 * 24 * 60 * 60
    );

    const userResponse = user.toJSON();
    delete userResponse.refreshToken;

    return {
      message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
      user: userResponse,
      tokens
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(`Error during login: ${error.message}`);
    throw ApiError.internal('Login failed');
  }
};


/**
 * Refresh access token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>}
 */
const refreshAccessToken = async (refreshToken) => {
  try {
    if (!refreshToken) {
      throw ApiError.unauthorized('Refresh token required');
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Check if token exists in Redis
    const cachedToken = await cacheHelper.get(
      `${CACHE_KEYS.REFRESH_TOKEN}${decoded.id}`
    );

    if (!cachedToken || cachedToken !== refreshToken) {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    // Find user
    const user = await User.findById(decoded.id);

    if (!user) {
      throw ApiError.unauthorized('User not found');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Account is deactivated');
    }

    // Verify token matches the one stored in database
    if (user.refreshToken !== refreshToken) {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    // Generate new tokens
    const tokens = generateTokens(user._id.toString(), user.role);

    // Update refresh token in database and cache
    user.refreshToken = tokens.refreshToken;
    await user.save();

    await cacheHelper.set(
      `${CACHE_KEYS.REFRESH_TOKEN}${user._id}`,
      tokens.refreshToken,
      7 * 24 * 60 * 60 // 7 days
    );

    logger.info(`Access token refreshed for user: ${user._id}`);

    return {
      message: 'Token refreshed successfully',
      tokens
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    logger.error(`Error refreshing token: ${error.message}`);
    throw ApiError.unauthorized('Invalid refresh token');
  }
};

/**
 * Logout user
 * @param {string} userId - User ID
 * @param {string} refreshToken - Refresh token (optional)
 * @returns {Promise<Object>}
 */
const logout = async (userId, refreshToken = null) => {
  try {
    // Clear refresh token from database
    await User.findByIdAndUpdate(userId, {
      $unset: { refreshToken: 1 }
    });

    // Clear tokens and user data from cache
    await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
    await cacheHelper.del(`${CACHE_KEYS.REFRESH_TOKEN}${userId}`);
    await cacheHelper.del(`${CACHE_KEYS.CART}${userId}`);

    logger.info(`User logged out: ${userId}`);

    return {
      message: SUCCESS_MESSAGES.LOGOUT_SUCCESS
    };
  } catch (error) {
    logger.error(`Error during logout: ${error.message}`);
    throw ApiError.internal('Logout failed');
  }
};

/**
 * Verify if phone number exists
 * @param {string} phone - Phone number
 * @returns {Promise<Object>}
 */
const checkPhoneExists = async (phone) => {
  const user = await User.findByPhone(phone);

  return {
    exists: !!user,
    isRegistered: !!user
  };
};

/**
 * Verify credentials for POS Override (Managers/Admins)
 * @param {string} phoneOrEmail - Phone or Email
 * @param {string} password - Password
 * @returns {Promise<Object>}
 */
const verifyPOSOverride = async (phoneOrEmail, password) => {
  // Reuse existing login logic for credential & status checks
  const result = await login(phoneOrEmail, password);
  const user = result.user;
  
  const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../utils/constants');
  
  const allowedPermissions = ROLE_PERMISSIONS[user.role] || [];
  if (!allowedPermissions.includes(PERMISSIONS.POS_OVERRIDE_BILL)) {
    throw ApiError.forbidden('You do not have permission to override POS bills');
  }

  return {
    success: true,
    message: 'Override authorized',
    manager: {
      id: user._id,
      name: user.name,
      role: user.role
    }
  };
};

/**
 * Initiate forgot password (send OTP)
 * @param {string} phoneOrEmail - Phone or Email
 * @returns {Promise<Object>}
 */
const forgotPassword = async (phoneOrEmail) => {
  const user = await User.findOne({
    $or: [
      { phone: phoneOrEmail },
      { email: phoneOrEmail.toLowerCase() }
    ]
  });

  if (!user) {
    throw ApiError.notFound('No account found with this phone/email');
  }

  if (!user.phone) {
    throw ApiError.badRequest('Phone number not associated with this account. Please contact admin.');
  }

  return await sendOTP(user.phone);
};

/**
 * Reset password using OTP
 * @param {string} phone - Phone number
 * @param {string} otp - OTP code
 * @param {string} newPassword - New password
 * @returns {Promise<Object>}
 */
const resetPassword = async (phone, otp, newPassword) => {
  const otpKey = `${CACHE_KEYS.OTP}${phone}`;
  const storedOTP = await cacheHelper.get(otpKey);

  if (!storedOTP || String(storedOTP) !== String(otp)) {
    throw ApiError.badRequest(ERROR_MESSAGES.INVALID_OTP);
  }

  const user = await User.findByPhone(phone);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  user.password = newPassword;
  await user.save();
  await cacheHelper.del(otpKey);

  return {
    message: 'Password reset successfully'
  };
};

module.exports = {
  sendOTP,
  verifyOTP,
  login,
  refreshAccessToken,
  logout,
  checkPhoneExists,
  verifyPOSOverride,
  forgotPassword,
  resetPassword
};

