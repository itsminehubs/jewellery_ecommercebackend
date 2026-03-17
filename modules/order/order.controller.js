const orderService = require('./order.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder(req.user._id, req.body);
  ApiResponse.created(order, 'Order created successfully').send(res);
});

const getUserOrders = asyncHandler(async (req, res) => {
  const result = await orderService.getUserOrders(req.user._id, req.query);
  ApiResponse.paginated(result.orders, result.page, result.limit, result.total).send(res);
});

const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id, req.user._id);
  ApiResponse.success(order, 'Order fetched successfully').send(res);
});

const cancelOrder = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const order = await orderService.cancelOrder(req.params.id, req.user._id, reason);
  ApiResponse.success(order, 'Order cancelled successfully').send(res);
});
const verifyPrice = asyncHandler(async (req, res) => {
  const result = await orderService.verifyPrice(req.body.items);
  ApiResponse.success(result, 'Price verified successfully').send(res);
});

const deleteOrder = asyncHandler(async (req, res) => {
  await orderService.deleteOrder(req.params.id, req.user._id);
  ApiResponse.success(null, 'Order deleted successfully').send(res);
});

module.exports = {
  createOrder,
  verifyPrice,
  getUserOrders,
  getOrder,
  cancelOrder,
  deleteOrder
};