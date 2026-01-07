const Order = require('./order.model');
const Product = require('../product/product.model');
const User = require('../user/user.model');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

const createOrder = async (userId, orderData) => {
  const user = await User.findById(userId).populate('cart.product');
  if (!user || user.cart.length === 0) throw ApiError.badRequest('Cart is empty');

  const items = user.cart.map(item => ({
    product: item.product._id,
    quantity: item.quantity,
    price: item.product.finalPrice,
    name: item.product.name,
    image: item.product.images[0]?.url
  }));

  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.18;
  const total = subtotal + tax + (orderData.shippingCost || 0);

  const order = new Order({
    user: userId,
    items,
    shippingAddress: orderData.shippingAddress,
    subtotal,
    tax,
    total,
    statusHistory: [{ status: 'pending', timestamp: new Date() }]
  });

  await order.save();
  await user.clearCart();
  
  logger.info(`Order created: ${order._id}`);
  return order;
};

const getUserOrders = async (userId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const orders = await Order.find({ user: userId }).sort('-createdAt').skip(skip).limit(limit).populate('items.product');
  const total = await Order.countDocuments({ user: userId });

  return { orders, total, page, limit };
};

const getOrderById = async (orderId, userId) => {
  const order = await Order.findOne({ _id: orderId, user: userId }).populate('items.product');
  if (!order) throw ApiError.notFound('Order not found');
  return order;
};

const updateOrderStatus = async (orderId, status, note = '') => {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  order.status = status;
  order.statusHistory.push({ status, timestamp: new Date(), note });
  
  if (status === 'delivered') order.deliveredAt = new Date();
  
  await order.save();
  logger.info(`Order ${orderId} status updated to ${status}`);
  
  return order;
};

const cancelOrder = async (orderId, userId, reason) => {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw ApiError.notFound('Order not found');
  
  if (['shipped', 'delivered'].includes(order.status)) {
    throw ApiError.badRequest('Cannot cancel shipped or delivered orders');
  }

  order.status = 'cancelled';
  order.cancelReason = reason;
  order.statusHistory.push({ status: 'cancelled', timestamp: new Date(), note: reason });
  
  await order.save();
  logger.info(`Order cancelled: ${orderId}`);
  
  return order;
};

module.exports = {
  createOrder,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder
};