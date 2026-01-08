const Order = require('./order.model');
const Product = require('../product/product.model');
const User = require('../user/user.model');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

const createOrder = async (userId, orderData) => {
  if (!orderData.items || orderData.items.length === 0) {
    throw ApiError.badRequest('Order items are required');
  }

  const items = [];
  let subtotal = 0;

  for (const cartItem of orderData.items) {
    const product = await Product.findById(cartItem.product);

    if (!product) {
      throw ApiError.badRequest('Product not found');
    }

    if (product.stock < cartItem.quantity) {
      throw ApiError.badRequest(`${product.name} is out of stock`);
    }

    const price = product.finalPrice || product.price;
    const itemTotal = price * cartItem.quantity;

    subtotal += itemTotal;

    items.push({
      product: product._id,
      name: product.name,
      image: product.images?.[0]?.url,
      quantity: cartItem.quantity,
      price
    });

    // Reduce stock (optional but recommended)
    product.stock -= cartItem.quantity;
    await product.save();
  }

  const tax = subtotal * 0.18;
  const shippingCost = orderData.shippingCost || 0;
  const total = subtotal + tax + shippingCost;

  const order = new Order({
    user: userId,
    items,
    shippingAddress: orderData.shippingAddress,
    paymentMethod: orderData.paymentMethod,
    subtotal,
    tax,
    shippingCost,
    total,
    statusHistory: [{ status: 'pending', timestamp: new Date() }]
  });

  await order.save();

  // Optional: clear cart
  await User.findByIdAndUpdate(userId, { cart: [] });

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
// order.service.js
const deleteOrder = async (orderId, userId) => {
  const order = await Order.findOne({ _id: orderId, user: userId });

  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  // Do NOT allow delete if payment succeeded
  if (order.paymentStatus === 'paid') {
    throw ApiError.badRequest('Paid order cannot be deleted');
  }

  // Restore product stock
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity }
    });
  }

  await order.deleteOne();
  logger.info(`Order deleted due to payment failure: ${orderId}`);
};

module.exports = {
  createOrder,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  deleteOrder,
};