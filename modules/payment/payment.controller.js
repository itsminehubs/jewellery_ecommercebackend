const paymentService = require('./payment.service');
const ApiResponse = require('../../utils/ApiResponse');
const Order = require('../order/order.model');
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
  const payments = await Order.find({ user: req.user._id })
    .select(
      'items total paymentStatus paymentMethod razorpayPaymentId createdAt'
    )
    .sort({ createdAt: -1 });

  ApiResponse.success(payments, 'User payments fetched').send(res);
});

const getAllPayments = asyncHandler(async (req, res) => {
  const { status, userId } = req.query;

  const filter = {};
  if (status) filter.paymentStatus = status;
  if (userId) filter.user = userId;

  const payments = await Order.find(filter)
    .populate('user', 'name email')
    .populate('items.product', 'name price')
    .sort({ createdAt: -1 });

  ApiResponse.success(payments, 'All payments fetched').send(res);
});
const getPaymentByOrderId = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId)
    .populate('user', 'name email')
    .populate('items.product', 'name');

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