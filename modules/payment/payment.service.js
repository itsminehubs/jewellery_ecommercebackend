const { sendEmail } = require('../../jobs/email.job');
const { generateOrderConfirmationEmail } = require('../../utils/emailTemplates');
const { createRazorpayOrder, verifyWebhookSignature, fetchPayment, refundPayment } = require('../../config/razorpay');
const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const crypto = require('crypto');
const loyaltyService = require('../user/loyalty.service');
const inventoryService = require('../product/inventory.service');
const logger = require('../../utils/logger');

const createPaymentOrder = async (orderId) => {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw ApiError.notFound('Order not found');

    const razorpayOrder = await createRazorpayOrder(
        Number(order.grandTotal),
        'INR',
        `order_${orderId}`,
        { orderId: orderId.toString() }
    );

    await prisma.order.update({
        where: { id: orderId },
        data: { razorpayOrderId: razorpayOrder.id }
    });

    return {
        orderId: order.id,
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

    const order = await prisma.order.findFirst({ where: { razorpayOrderId: razorpay_order_id } });
    if (!order) throw ApiError.notFound('Order not found');

    const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: {
            razorpayPaymentId: razorpay_payment_id,
            paymentStatus: 'COMPLETED',
            orderStatus: 'processing'
        }
    });

    logger.info(`Payment verified for order: ${order.id}`);

    // AWARD POINTS ONLY AFTER SUCCESSFUL PAYMENT
    if (loyaltyService.awardPointsPrisma) {
        await loyaltyService.awardPointsPrisma(order.userId, Number(order.grandTotal));
    }

    try {
        const fullOrderForEmail = await prisma.order.findUnique({
            where: { id: order.id },
            include: { items: { include: { product: true } } }
        });
        const user = await prisma.user.findUnique({ where: { id: order.userId } });

        if (user && user.email) {
            const emailContent = generateOrderConfirmationEmail(fullOrderForEmail, user);
            sendEmail({
                to: user.email,
                emailType: 'customer',
                subject: emailContent.subject,
                text: emailContent.text,
                html: emailContent.html
            }).catch(e => logger.error(`Order Confirmation Email error: ${e.message}`));
        }
    } catch (err) {
        logger.error(`Failed to send order confirmation email: ${err.message}`);
    }

    return updatedOrder;
};

const handleRefund = async (orderId) => {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw ApiError.notFound('Order not found');

    if (!order.razorpayPaymentId) {
        throw ApiError.badRequest('No payment found for this order');
    }

    const refund = await refundPayment(order.razorpayPaymentId);
    
    const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
            paymentStatus: 'REFUNDED',
            orderStatus: 'cancelled'
        }
    });

    logger.info(`Refund processed for order: ${orderId}`);

    return { order: updatedOrder, refund };
};

const markPaymentFailed = async (orderId) => {
    return await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
            where: { id: orderId },
            include: { items: true }
        });

        if (!order) throw ApiError.notFound('Order not found');

        const updatedOrder = await tx.order.update({
            where: { id: orderId },
            data: {
                paymentStatus: 'FAILED',
                orderStatus: 'cancelled'
            }
        });

        logger.info(`Payment failed for order: ${orderId}`);

        // RESTORE STOCK ON PAYMENT FAILURE
        for (const item of order.items) {
            await inventoryService.updateStock(item.productId, item.quantity, {
                type: 'adjustment',
                action: 'PAYMENT_FAILURE_RESTORE',
                referenceId: order.id,
                performedBy: order.userId,
                notes: 'Payment failed, restoring stock',
                tx
            });
        }

        return updatedOrder;
    });
};

module.exports = {
    createPaymentOrder,
    verifyPayment,
    handleRefund,
    markPaymentFailed,
};