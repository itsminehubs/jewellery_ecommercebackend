const { generateOTP } = require('./hash');
const { cacheHelper } = require('../config');
const { CACHE_KEYS, CACHE_TTL } = require('./constants');
const logger = require('./logger');
const ApiError = require('./ApiError');

/**
 * Generate and store OTP for a given key (phone/email)
 * @param {string} key - Unique identifier (phone or email)
 * @param {number} expiration - Expiration in seconds (default: 300)
 * @param {string} purpose - 'login' or 'reset_password'
 * @returns {Promise<string>} Generated OTP
 */
const generateAndStoreOTP = async (key, expiration = CACHE_TTL.OTP, purpose = 'login') => {
  try {
    const otp = generateOTP(6);
    const otpKey = `${CACHE_KEYS.OTP}${key}`;
    
    await cacheHelper.set(otpKey, otp, expiration);
    
    // Check if key is a phone number (10 digits)
    if (/^\d{10}$/.test(key)) {
      const minutes = Math.floor(expiration / 60);
      let messageTemplate = '';
      if (purpose === 'reset_password') {
        messageTemplate = `The OTP to reset your CarbonSmith account password is ${otp}. Do not share this code with anyone.`;
      } else {
        messageTemplate = `${otp} is your OTP to log in to your CarbonSmith account. Valid for ${minutes} mins. Do not share it with anyone.`;
      }
      
      const params = new URLSearchParams({
        access_token: 'de9ba8ce66886140238eeeade03c8310',
        to: key,
        country_code: '+91',
        sender: 'CRBNSM',
        service: 'SI',
        message: messageTemplate
      });

      try {
        const response = await fetch(`https://apis.wappie.shop/v1/sms/messages?${params.toString()}`, { method: 'GET' });
        if (!response.ok) {
           const errorText = await response.text();
           logger.error(`SMS API error for ${key}: ${response.status} ${errorText}`);
        } else {
           logger.info(`SMS sent successfully to ${key} for purpose: ${purpose}`);
        }
      } catch (smsError) {
        logger.error(`Failed to send SMS to ${key}: ${smsError.message}`);
      }
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
