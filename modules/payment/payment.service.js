const { createRazorpayOrder, verifyWebhookSignature, fetchPayment, refundPayment } = require('../../config/razorpay');
const Order = require('../order/order.model');
const ApiError = require('../../utils/ApiError');
const crypto = require('crypto');
const logger = require('../../utils/logger');

const createPaymentOrder = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  const razorpayOrder = await createRazorpayOrder(
    order.total,
    'INR',
    `order_${orderId}`,
    { orderId: orderId.toString() }
  );

  order.razorpayOrderId = razorpayOrder.id;
  await order.save();

  return {
    orderId: order._id,
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    keyId: process.env.RAZORPAY_KEY_ID
  };
};

const verifyPayment = async (paymentData) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;

  const text = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(text)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    throw ApiError.badRequest('Invalid payment signature');
  }

  const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
  if (!order) throw ApiError.notFound('Order not found');

  order.razorpayPaymentId = razorpay_payment_id;
  order.paymentStatus = 'completed';
  order.status = 'confirmed';
  order.statusHistory.push({ status: 'confirmed', timestamp: new Date() });
  
  await order.save();
  logger.info(`Payment verified for order: ${order._id}`);

  return order;
};

const handleRefund = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  if (!order.razorpayPaymentId) {
    throw ApiError.badRequest('No payment found for this order');
  }

  const refund = await refundPayment(order.razorpayPaymentId);
  
  order.paymentStatus = 'refunded';
  order.status = 'refunded';
  order.statusHistory.push({ status: 'refunded', timestamp: new Date() });
  
  await order.save();
  logger.info(`Refund processed for order: ${orderId}`);

  return { order, refund };
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handleRefund
};