const { verifyWebhookSignature } = require('../../config/razorpay');
const prisma = require('../../config/prisma');
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
  const order = await prisma.order.findUnique({ where: { razorpayOrderId: payload.order_id } });
  if (order) {
    if (order.paymentStatus === 'completed' || order.paymentStatus === 'COMPLETED') {
      logger.info(`Order ${order.id} is already marked as completed. Ignoring webhook.`);
      return;
    }
    
    if (order.orderStatus === 'cancelled' || order.orderStatus === 'CANCELLED') {
      logger.error(`Payment captured for CANCELLED order: ${order.id}. Manual refund may be required.`);
      await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'completed' }
      });
      return;
    }

    await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'completed', orderStatus: 'processing' }
    });
    logger.info(`Payment captured for order: ${order.id}`);
  }
};

const handlePaymentFailed = async (payload) => {
  const order = await prisma.order.findUnique({ where: { razorpayOrderId: payload.order_id } });
  if (order) {
    if (order.paymentStatus === 'completed' || order.paymentStatus === 'COMPLETED') {
      logger.warn(`Payment failed webhook received for already COMPLETED order: ${order.id}. Ignoring.`);
      return;
    }
    
    await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'failed' }
    });
    logger.info(`Payment failed for order: ${order.id}`);
  }
};

module.exports = { handleWebhook };