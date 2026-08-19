const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const { generateTokens, verifyRefreshToken } = require('../../utils/jwt');
const { cacheHelper } = require('../../config');
const { CACHE_KEYS, CACHE_TTL, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../../utils/constants');
const logger = require('../../utils/logger');
const otpService = require('../../utils/otpService');
const { comparePassword } = require('../../utils/hash');

/**
 * Send OTP to phone number
 */
const sendOTP = async (phone) => {
  try {
    const otp = await otpService.generateAndStoreOTP(phone);

    return {
      message: SUCCESS_MESSAGES.OTP_SENT,
      phone,
      otp: process.env.NODE_ENV === 'development' ? otp : undefined
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(`Error sending OTP: ${error.message}`);
    throw ApiError.internal('Failed to send OTP');
  }
};

/**
 * Verify OTP and login/register user
 */
const verifyOTP = async (phone, otp, name = null, email = null) => {
  try {
    await otpService.verifyOTP(phone, otp);

    let user = await prisma.user.findUnique({ where: { phone } });
    let isNewUser = false;
    const now = new Date();

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          name: name || `User${phone.slice(-4)}`,
          email: email || null,
          isPhoneVerified: true,
          lastLogin: now
        }
      });
      isNewUser = true;
    } else {
      if (user.lockUntil && user.lockUntil > now) throw ApiError.forbidden('Account is temporarily locked');
      if (!user.isActive) throw ApiError.forbidden('Account is deactivated');

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          isPhoneVerified: true,
          lastLogin: now,
          name: (name && !user.name) ? name : undefined,
          email: (email && !user.email) ? email : undefined
        }
      });
    }

    // Generate tokens
    const tokens = generateTokens(user.id, user.role);

    user = await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken }
    });

    // CACHE CLEAN JSON
    const userJson = { ...user };
    delete userJson.password;
    delete userJson.refreshToken;

    await cacheHelper.set(
      `${CACHE_KEYS.USER}${user.id}`,
      JSON.stringify(userJson),
      CACHE_TTL.MEDIUM
    );

    await cacheHelper.set(
      `${CACHE_KEYS.REFRESH_TOKEN}${user.id}`,
      tokens.refreshToken,
      7 * 24 * 60 * 60
    );

    return {
      message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
      user: userJson,
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
 */
const login = async (phoneOrEmail, password) => {
  try {
    // Find user by phone or email
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: phoneOrEmail },
          { email: phoneOrEmail.toLowerCase() }
        ]
      }
    });

    if (!user) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Account is deactivated');
    }

    const now = new Date();
    if (user.lockUntil && user.lockUntil > now) {
      throw ApiError.forbidden('Account is temporarily locked');
    }

    if (!user.password) {
      throw ApiError.badRequest('Please use OTP login or set a password first');
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      // Handle login attempts logic
      if (user.lockUntil && user.lockUntil < now) {
        await prisma.user.update({
          where: { id: user.id },
          data: { loginAttempts: 1, lockUntil: null }
        });
      } else {
        const attempts = user.loginAttempts + 1;
        const lockData = { loginAttempts: attempts };
        if (attempts >= 5) {
          lockData.lockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
        }
        await prisma.user.update({
          where: { id: user.id },
          data: lockData
        });
      }
      throw ApiError.unauthorized('Invalid credentials');
    }

    // Generate tokens
    const tokens = generateTokens(user.id, user.role);

    // Reset attempts and update last login
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockUntil: null,
        lastLogin: now,
        refreshToken: tokens.refreshToken
      }
    });

    const userJson = { ...user };
    delete userJson.password;
    delete userJson.refreshToken;

    await cacheHelper.set(
      `${CACHE_KEYS.USER}${user.id}`,
      JSON.stringify(userJson),
      CACHE_TTL.MEDIUM
    );

    await cacheHelper.set(
      `${CACHE_KEYS.REFRESH_TOKEN}${user.id}`,
      tokens.refreshToken,
      7 * 24 * 60 * 60
    );

    return {
      message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
      user: userJson,
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
 */
const refreshAccessToken = async (refreshToken) => {
  try {
    if (!refreshToken) {
      throw ApiError.unauthorized('Refresh token required');
    }

    const decoded = verifyRefreshToken(refreshToken);

    const cachedToken = await cacheHelper.get(
      `${CACHE_KEYS.REFRESH_TOKEN}${decoded.id}`
    );

    if (!cachedToken || cachedToken !== refreshToken) {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user) {
      throw ApiError.unauthorized('User not found');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Account is deactivated');
    }

    if (user.refreshToken !== refreshToken) {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    const tokens = generateTokens(user.id, user.role);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken }
    });

    await cacheHelper.set(
      `${CACHE_KEYS.REFRESH_TOKEN}${user.id}`,
      tokens.refreshToken,
      7 * 24 * 60 * 60
    );

    logger.info(`Access token refreshed for user: ${user.id}`);

    return {
      message: 'Token refreshed successfully',
      tokens
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(`Error refreshing token: ${error.message}`);
    throw ApiError.unauthorized('Invalid refresh token');
  }
};

/**
 * Logout user
 */
const logout = async (userId, refreshToken = null) => {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null }
    });

    await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
    await cacheHelper.del(`${CACHE_KEYS.REFRESH_TOKEN}${userId}`);
    await cacheHelper.del(`${CACHE_KEYS.CART}${userId}`);

    logger.info(`User logged out: ${userId}`);

    return { message: SUCCESS_MESSAGES.LOGOUT_SUCCESS };
  } catch (error) {
    logger.error(`Error during logout: ${error.message}`);
    throw ApiError.internal('Logout failed');
  }
};

/**
 * Verify if phone number exists
 */
const checkPhoneExists = async (phone) => {
  const user = await prisma.user.findUnique({ where: { phone } });

  return {
    exists: !!user,
    isRegistered: !!user
  };
};

/**
 * Verify credentials for POS Override (Managers/Admins)
 */
const verifyPOSOverride = async (phoneOrEmail, password) => {
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
      id: user.id,
      name: user.name,
      role: user.role
    }
  };
};

/**
 * Initiate forgot password (send OTP)
 */
const forgotPassword = async (phoneOrEmail) => {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: phoneOrEmail },
        { email: phoneOrEmail.toLowerCase() }
      ]
    }
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
 */
const resetPassword = async (phone, otp, newPassword) => {
  await otpService.verifyOTP(phone, otp);

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const { hashPassword } = require('../../utils/hash');
  const hashedPassword = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword }
  });

  return { message: 'Password reset successfully' };
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
