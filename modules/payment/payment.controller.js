const paymentService = require('./payment.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const prisma = require('../../config/prisma');
const { asyncHandler } = require('../../middlewares/error.middleware');

const createPaymentOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  const result = await paymentService.createPaymentOrder(orderId);
  ApiResponse.success(result, 'Payment order created').send(res);
});

const verifyPayment = asyncHandler(async (req, res) => {
  const order = await paymentService.verifyPayment(req.body);
  ApiResponse.success(order, 'Payment verified successfully').send(res);
});

const refundPayment = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const result = await paymentService.handleRefund(orderId);
  ApiResponse.success(result, 'Refund processed successfully').send(res);
});

const markPaymentFailed = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await paymentService.markPaymentFailed(orderId);
  ApiResponse.success(order, 'Payment marked as failed').send(res);
});

const getMyPayments = asyncHandler(async (req, res) => {
  const payments = await prisma.order.findMany({
    where: { userId: req.user.id },
    select: {
      id: true,
      items: true,
      grandTotal: true,
      paymentStatus: true,
      paymentMethod: true,
      razorpayPaymentId: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

  ApiResponse.success(payments, 'User payments fetched').send(res);
});

const getAllPayments = asyncHandler(async (req, res) => {
  const { status, userId } = req.query;

  const where = {};
  if (status) where.paymentStatus = status;
  if (userId) where.userId = userId;

  const payments = await prisma.order.findMany({
    where,
    include: {
        user: { select: { name: true, email: true } },
        items: { include: { product: { select: { name: true, price: true } } } }
    },
    orderBy: { createdAt: 'desc' }
  });

  ApiResponse.success(payments, 'All payments fetched').send(res);
});

const getPaymentByOrderId = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
          user: { select: { name: true, email: true } },
          items: { include: { product: { select: { name: true } } } }
      }
  });

  if (!order) throw ApiError.notFound('Order not found');

  ApiResponse.success(order, 'Payment details fetched').send(res);
});

module.exports = {
  createPaymentOrder,
  verifyPayment,
  refundPayment,
  markPaymentFailed,
  getMyPayments,
  getAllPayments,
  getPaymentByOrderId,
};