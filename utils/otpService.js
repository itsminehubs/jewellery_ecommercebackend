const { generateOTP } = require('./hash');
const { cacheHelper } = require('../config');
const { CACHE_KEYS, CACHE_TTL } = require('./constants');
const logger = require('./logger');
const ApiError = require('./ApiError');

const SMS_TEMPLATE_IDS = {
  login: '1077335120021098038',
  reset_password: '1077367200020363807',
  credit_memo_redemption: '1077251020006541404',
  scheme_closure: '1077512160006563219'
};

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
const sendSMS = async (phone, message, templateId) => {
  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
  if (cleanPhone.length !== 10) {
    logger.warn('[SMS] Invalid 10-digit phone number');
    return false;
  }

  const accessToken = process.env.WAPPIE_ACCESS_TOKEN || 'de9ba8ce66886140238eeeade03c8310';
  if (!accessToken) {
    logger.error('[SMS] Wappie access token is not configured');
    return false;
  }

  const params = new URLSearchParams({
    access_token: accessToken,
    to: cleanPhone,
    country_code: '+91',
    sender: process.env.WAPPIE_SENDER_ID || 'CRBNSM',
    service: process.env.WAPPIE_SERVICE || 'SI',
    message,
    template_id: templateId
  });

  try {
    const response = await fetch(`https://apis.wappie.shop/v1/sms/messages?${params.toString()}`, { method: 'GET' });
    if (!response.ok) {
      logger.error(`[SMS] Wappie API rejected the request with status ${response.status}`);
      return false;
    }
    logger.info('[SMS] Request accepted by Wappie gateway');
    return true;
  } catch (smsError) {
    logger.error(`[SMS] Wappie request failed: ${smsError.message}`);
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
  const otpKey = `${CACHE_KEYS.OTP}${key}`;
  try {
    const otp = generateOTP(6);
    
    await cacheHelper.set(otpKey, otp, expiration);
    
    // Check if key or targetPhone has a valid 10-digit phone number
    const candidatePhone = targetPhone || key;
    const cleanPhone = String(candidatePhone || '').replace(/\D/g, '').slice(-10);
    
    if (cleanPhone.length === 10) {
      // Also cache under the clean phone number if key is different (e.g. key is memoId or has country code)
      if (key !== cleanPhone) {
        const phoneKey = `${CACHE_KEYS.OTP}${cleanPhone}`;
        await cacheHelper.set(phoneKey, otp, expiration);
      }

      const minutes = Math.floor(expiration / 60);
      let messageTemplate = '';
      if (purpose === 'reset_password') {
        messageTemplate = `The OTP to reset your CarbonSmith account password is ${otp}. Do not share this code with anyone.`;
      } else if (purpose === 'credit_memo_redemption') {
        messageTemplate = `${otp}is your one-time verification code to authorize redemption of your Credit Memo / Advance Voucher at CarbonSmith. Valid for ${minutes} mins. Do not share it with anyone.`;
      } else if (purpose === 'scheme_closure') {
        messageTemplate = `${otp} is your verification code to authorise closure and redemption of your Savings Scheme at CarbonSmith. Valid for ${minutes} mins.`;
      } else {
        messageTemplate = `${otp} is your OTP to log in to your CarbonSmith account. Valid for ${minutes} mins. Do not share it with anyone.`;
      }
      
      if (process.env.IS_SANDBOX === 'true' || process.env.NODE_ENV !== 'production') {
        logger.info(`[SANDBOX OTP] ${otp} for ${cleanPhone} (purpose: ${purpose})`);
        console.log(`\n🔐 [SANDBOX OTP] ${otp} for ${cleanPhone} (purpose: ${purpose})\n`);
      } else {
        const templateId = SMS_TEMPLATE_IDS[purpose] || SMS_TEMPLATE_IDS.login;
        const sent = await sendSMS(cleanPhone, messageTemplate, templateId);
        if (!sent) {
          await cacheHelper.del(otpKey).catch(() => {});
          if (key !== cleanPhone) {
            await cacheHelper.del(`${CACHE_KEYS.OTP}${cleanPhone}`).catch(() => {});
          }
          throw ApiError.internal('Failed to send OTP SMS. Please try again.');
        }
      }
    }
    
    return otp;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(`Error generating/storing OTP: ${error.message}`, error);
    throw ApiError.internal(`Failed to generate OTP: ${error.message}`);
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
    const isSandbox = process.env.IS_SANDBOX === 'true' || process.env.NODE_ENV !== 'production';

    // In sandbox or development mode, allow instant testing with master test OTP 123456 or 000000
    if (isSandbox && (String(otp).trim() === '123456' || String(otp).trim() === '000000')) {
      logger.info(`[SANDBOX OTP] Test OTP accepted for ${key}`);
      return true;
    }

    const cleanPhone = String(key || '').replace(/\D/g, '').slice(-10);
    const otpKey = `${CACHE_KEYS.OTP}${key}`;
    let storedOTP = await cacheHelper.get(otpKey);
    
    // If key had country code or prefix, also look up by clean phone number
    if (!storedOTP && cleanPhone && cleanPhone !== key) {
      storedOTP = await cacheHelper.get(`${CACHE_KEYS.OTP}${cleanPhone}`);
    }
    
    if (!storedOTP) {
      if (isSandbox) {
        return true;
      }
      throw ApiError.badRequest('OTP expired or invalid');
    }
    
    if (String(storedOTP).trim() !== String(otp).trim()) {
      throw ApiError.badRequest('Invalid OTP');
    }
    
    if (deleteAfterVerify) {
      await cacheHelper.del(otpKey).catch(() => {});
      if (cleanPhone && cleanPhone !== key) {
        await cacheHelper.del(`${CACHE_KEYS.OTP}${cleanPhone}`).catch(() => {});
      }
    }
    
    return true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(`Error verifying OTP for ${key}: ${error.message}`, error);
    throw ApiError.internal('Failed to verify OTP');
  }
};

module.exports = {
  generateAndStoreOTP,
  verifyOTP
};
