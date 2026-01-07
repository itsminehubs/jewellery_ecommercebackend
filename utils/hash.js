const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const logger = require('./logger');

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @param {number} rounds - Salt rounds (default: 10)
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password, rounds = 10) => {
  try {
    const salt = await bcrypt.genSalt(rounds);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
  } catch (error) {
    logger.error(`Error hashing password: ${error.message}`);
    throw new Error('Failed to hash password');
  }
};

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hashedPassword - Hashed password
 * @returns {Promise<boolean>} True if passwords match
 */
const comparePassword = async (password, hashedPassword) => {
  try {
    const isMatch = await bcrypt.compare(password, hashedPassword);
    return isMatch;
  } catch (error) {
    logger.error(`Error comparing password: ${error.message}`);
    throw new Error('Failed to compare password');
  }
};

/**
 * Generate random OTP
 * @param {number} length - OTP length (default: 6)
 * @returns {string} OTP string
 */
const generateOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';

  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }

  return otp;
};

/**
 * Generate random token
 * @param {number} length - Token length in bytes (default: 32)
 * @returns {string} Random token
 */
const generateRandomToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash string using SHA256
 * @param {string} str - String to hash
 * @returns {string} Hashed string
 */
const hashString = (str) => {
  return crypto
    .createHash('sha256')
    .update(str)
    .digest('hex');
};

/**
 * Generate HMAC signature
 * @param {string} data - Data to sign
 * @param {string} secret - Secret key
 * @returns {string} HMAC signature
 */
const generateHMAC = (data, secret) => {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
};

/**
 * Verify HMAC signature
 * @param {string} data - Original data
 * @param {string} signature - Signature to verify
 * @param {string} secret - Secret key
 * @returns {boolean} True if signature is valid
 */
const verifyHMAC = (data, signature, secret) => {
  const expectedSignature = generateHMAC(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

/**
 * Encrypt text
 * @param {string} text - Text to encrypt
 * @param {string} secretKey - Encryption key
 * @returns {string} Encrypted text
 */
const encrypt = (text, secretKey) => {
  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(secretKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    logger.error(`Error encrypting text: ${error.message}`);
    throw new Error('Encryption failed');
  }
};

/**
 * Decrypt text
 * @param {string} encryptedText - Encrypted text
 * @param {string} secretKey - Encryption key
 * @returns {string} Decrypted text
 */
const decrypt = (encryptedText, secretKey) => {
  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(secretKey, 'salt', 32);
    
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error(`Error decrypting text: ${error.message}`);
    throw new Error('Decryption failed');
  }
};

/**
 * Generate UUID
 * @returns {string} UUID
 */
const generateUUID = () => {
  return crypto.randomUUID();
};

module.exports = {
  hashPassword,
  comparePassword,
  generateOTP,
  generateRandomToken,
  hashString,
  generateHMAC,
  verifyHMAC,
  encrypt,
  decrypt,
  generateUUID
};
