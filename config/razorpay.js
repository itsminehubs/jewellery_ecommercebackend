const Razorpay = require('razorpay');
const logger = require('../utils/logger');

let razorpayInstance = null;

/**
 * Initialize Razorpay instance
 * @returns {Razorpay}
 */
const initializeRazorpay = () => {
  if (razorpayInstance) {
    return razorpayInstance;
  }

  try {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    logger.info('Razorpay initialized successfully');
    return razorpayInstance;
  } catch (error) {
    logger.error(`Razorpay initialization failed: ${error.message}`);
    throw error;
  }
};

/**
 * Get Razorpay instance
 * @returns {Razorpay}
 */
const getRazorpayInstance = () => {
  if (!razorpayInstance) {
    return initializeRazorpay();
  }
  return razorpayInstance;
};

/**
 * Create Razorpay order
 * @param {number} amount - Amount in paise
 * @param {string} currency - Currency code (default: INR)
 * @param {string} receipt - Receipt ID
 * @param {Object} notes - Additional notes
 * @returns {Promise<Object>}
 */
const createRazorpayOrder = async (amount, currency = 'INR', receipt, notes = {}) => {
  try {
    const instance = getRazorpayInstance();
    
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency,
      receipt,
      notes,
      payment_capture: 1 // Auto capture payment
    };

    const order = await instance.orders.create(options);
    logger.info(`Razorpay order created: ${order.id}`);
    
    return order;
  } catch (error) {
    logger.error(`Failed to create Razorpay order: ${error.message}`);
    throw error;
  }
};

/**
 * Fetch Razorpay order details
 * @param {string} orderId - Razorpay order ID
 * @returns {Promise<Object>}
 */
const fetchRazorpayOrder = async (orderId) => {
  try {
    const instance = getRazorpayInstance();
    const order = await instance.orders.fetch(orderId);
    return order;
  } catch (error) {
    logger.error(`Failed to fetch Razorpay order: ${error.message}`);
    throw error;
  }
};

/**
 * Fetch payment details
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<Object>}
 */
const fetchPayment = async (paymentId) => {
  try {
    const instance = getRazorpayInstance();
    const payment = await instance.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    logger.error(`Failed to fetch payment: ${error.message}`);
    throw error;
  }
};

/**
 * Capture payment
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Amount in paise
 * @param {string} currency - Currency code
 * @returns {Promise<Object>}
 */
const capturePayment = async (paymentId, amount, currency = 'INR') => {
  try {
    const instance = getRazorpayInstance();
    const payment = await instance.payments.capture(
      paymentId,
      Math.round(amount * 100),
      currency
    );
    logger.info(`Payment captured: ${paymentId}`);
    return payment;
  } catch (error) {
    logger.error(`Failed to capture payment: ${error.message}`);
    throw error;
  }
};

/**
 * Refund payment
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Amount to refund in paise (optional, full refund if not provided)
 * @returns {Promise<Object>}
 */
const refundPayment = async (paymentId, amount = null) => {
  try {
    const instance = getRazorpayInstance();
    
    const refundData = amount 
      ? { amount: Math.round(amount * 100) }
      : {};

    const refund = await instance.payments.refund(paymentId, refundData);
    logger.info(`Payment refunded: ${paymentId}`);
    
    return refund;
  } catch (error) {
    logger.error(`Failed to refund payment: ${error.message}`);
    throw error;
  }
};

/**
 * Verify webhook signature
 * @param {string} body - Request body
 * @param {string} signature - Razorpay signature from header
 * @param {string} secret - Webhook secret
 * @returns {boolean}
 */
const verifyWebhookSignature = (body, signature, secret) => {
  try {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    return expectedSignature === signature;
  } catch (error) {
    logger.error(`Failed to verify webhook signature: ${error.message}`);
    return false;
  }
};

module.exports = {
  initializeRazorpay,
  getRazorpayInstance,
  createRazorpayOrder,
  fetchRazorpayOrder,
  fetchPayment,
  capturePayment,
  refundPayment,
  verifyWebhookSignature
};
