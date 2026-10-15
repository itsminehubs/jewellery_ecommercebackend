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
/**
 * Send real SMS via Wappie SMS Gateway
 * @param {string} phone - 10-digit mobile number
 * @param {string} message - Message body
 */
const sendSMS = async (phone, message) => {
  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
  if (cleanPhone.length !== 10) {
    logger.warn(`[SMS] Invalid 10-digit phone number: ${phone}`);
    return false;
  }

  const params = new URLSearchParams({
    access_token: 'de9ba8ce66886140238eeeade03c8310',
    to: cleanPhone,
    country_code: '+91',
    sender: 'CRBNSM',
    service: 'SI',
    message: message
  });

  try {
    const response = await fetch(`https://apis.wappie.shop/v1/sms/messages?${params.toString()}`, { method: 'GET' });
    const responseText = await response.text();
    if (!response.ok) {
      logger.error(`[SMS] Wappie API error for ${cleanPhone}: ${response.status} ${responseText}`);
      return false;
    }
    logger.info(`[SMS] Successfully delivered to ${cleanPhone}: ${responseText}`);
    return true;
  } catch (smsError) {
    logger.error(`[SMS] Failed to send SMS to ${cleanPhone}: ${smsError.message}`);
    return false;
  }
};

/**
 * Generate and store OTP for a given key (phone/email/memoId)
 * @param {string} key - Unique identifier (phone or custom key)
 * @param {number} expiration - Expiration in seconds (default: 300)
 * @param {string} purpose - 'login', 'reset_password', 'credit_memo_redemption', 'scheme_closure'
 * @param {string} targetPhone - Optional phone number if key is not a phone number
 * @returns {Promise<string>} Generated OTP
 */
const generateAndStoreOTP = async (key, expiration = CACHE_TTL.OTP, purpose = 'login', targetPhone = null) => {
  try {
    const otp = generateOTP(6);
    const otpKey = `${CACHE_KEYS.OTP}${key}`;
    
    await cacheHelper.set(otpKey, otp, expiration);
    
    // Check if key or targetPhone has a valid 10-digit phone number
    const candidatePhone = targetPhone || key;
    const cleanPhone = String(candidatePhone || '').replace(/\D/g, '').slice(-10);
    
    if (cleanPhone.length === 10) {
      // Also cache under the clean phone number if key is different (e.g. key is memoId)
      if (key !== cleanPhone) {
        const phoneKey = `${CACHE_KEYS.OTP}${cleanPhone}`;
        await cacheHelper.set(phoneKey, otp, expiration);
      }

      const minutes = Math.floor(expiration / 60);
      let messageTemplate = '';
      if (purpose === 'reset_password') {
        messageTemplate = `The OTP to reset your CarbonSmith account password is ${otp}. Do not share this code with anyone.`;
      } else if (purpose === 'credit_memo_redemption') {
        messageTemplate = `${otp} is your one-time verification code to authorize redemption of your Credit Memo / Advance Voucher at CarbonSmith. Valid for ${minutes} mins. Do not share it with anyone.`;
      } else if (purpose === 'scheme_closure') {
        messageTemplate = `${otp} is your verification code to authorize closure and redemption of your Savings Scheme at CarbonSmith. Valid for ${minutes} mins.`;
      } else {
        messageTemplate = `${otp} is your OTP to log in to your CarbonSmith account. Valid for ${minutes} mins. Do not share it with anyone.`;
      }
      
      if (process.env.IS_SANDBOX === 'true' || process.env.NODE_ENV !== 'production') {
        logger.info(`[SANDBOX OTP] ${otp} for ${cleanPhone} (purpose: ${purpose})`);
        console.log(`\n🔐 [SANDBOX OTP] ${otp} for ${cleanPhone} (purpose: ${purpose})\n`);
      } else {
        await sendSMS(cleanPhone, messageTemplate);
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
