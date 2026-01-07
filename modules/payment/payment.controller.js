const paymentService = require('./payment.service');
const ApiResponse = require('../../utils/ApiResponse');
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

module.exports = {
  createPaymentOrder,
  verifyPayment,
  refundPayment
};