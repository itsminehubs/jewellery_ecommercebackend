const { verifyWebhookSignature } = require('../../config/razorpay');
const Order = require('../order/order.model');
const logger = require('../../utils/logger');

const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);

    const isValid = verifyWebhookSignature(body, signature, process.env.RAZORPAY_WEBHOOK_SECRET);
    
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload.payment.entity;

    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload);
        break;
      case 'payment.failed':
        await handlePaymentFailed(payload);
        break;
      default:
        logger.info(`Unhandled webhook event: ${event}`);
    }

    res.json({ status: 'ok' });
  } catch (error) {
    logger.error(`Webhook error: ${error.message}`);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

const handlePaymentCaptured = async (payload) => {
  const order = await Order.findOne({ razorpayOrderId: payload.order_id });
  if (order) {
    order.paymentStatus = 'completed';
    order.status = 'confirmed';
    await order.save();
    logger.info(`Payment captured for order: ${order._id}`);
  }
};

const handlePaymentFailed = async (payload) => {
  const order = await Order.findOne({ razorpayOrderId: payload.order_id });
  if (order) {
    order.paymentStatus = 'failed';
    await order.save();
    logger.info(`Payment failed for order: ${order._id}`);
  }
};

module.exports = { handleWebhook };