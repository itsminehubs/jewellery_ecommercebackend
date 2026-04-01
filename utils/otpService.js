const { generateOTP } = require('./hash');
const { cacheHelper } = require('../config');
const { CACHE_KEYS, CACHE_TTL } = require('./constants');
const logger = require('./logger');
const ApiError = require('./ApiError');

/**
 * Generate and store OTP for a given key (phone/email)
 * @param {string} key - Unique identifier (phone or email)
 * @param {number} expiration - Expiration in seconds (default: 300)
 * @returns {Promise<string>} Generated OTP
 */
const generateAndStoreOTP = async (key, expiration = CACHE_TTL.OTP) => {
  try {
    const otp = generateOTP(6);
    const otpKey = `${CACHE_KEYS.OTP}${key}`;
    
    await cacheHelper.set(otpKey, otp, expiration);
    
    if (process.env.NODE_ENV === 'development') {
      logger.info(`OTP for ${key}: ${otp}`);
      console.log(`\n🔐 [DEV] OTP for ${key}: ${otp}\n`);
    }
    
    return otp;
  } catch (error) {
    logger.error(`Error generating/storing OTP for ${key}: ${error.message}`);
    throw ApiError.internal('Failed to generate OTP');
  }
};

/**
 * Verify OTP for a given key
 * @param {string} key - Unique identifier (phone or email)
 * @param {string} otp - OTP to verify
 * @param {boolean} deleteAfterVerify - Whether to delete OTP after successful verification (default: true)
 * @returns {Promise<boolean>} True if valid
 */
const verifyOTP = async (key, otp, deleteAfterVerify = true) => {
  try {
    const otpKey = `${CACHE_KEYS.OTP}${key}`;
    const storedOTP = await cacheHelper.get(otpKey);
    
    if (!storedOTP) {
      throw ApiError.badRequest('OTP expired or invalid');
    }
    
    if (String(storedOTP) !== String(otp)) {
      throw ApiError.badRequest('Invalid OTP');
    }
    
    if (deleteAfterVerify) {
      await cacheHelper.del(otpKey);
    }
    
    return true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(`Error verifying OTP for ${key}: ${error.message}`);
    throw ApiError.internal('Failed to verify OTP');
  }
};

module.exports = {
  generateAndStoreOTP,
  verifyOTP
};
