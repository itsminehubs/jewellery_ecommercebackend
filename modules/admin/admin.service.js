const User = require('../user/user.model');
const Product = require('../product/product.model');
const Order = require('../order/order.model');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

const getDashboardStats = async () => {
  const totalUsers = await User.countDocuments({ role: 'user' });
  const totalProducts = await Product.countDocuments();
  const totalOrders = await Order.countDocuments();
  const pendingOrders = await Order.countDocuments({ status: 'pending' });
  
  const revenue = await Order.aggregate([
    { $match: { paymentStatus: 'completed' } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]);

  const topProducts = await Product.find().sort('-sales').limit(5);

  return {
    totalUsers,
    totalProducts,
    totalOrders,
    pendingOrders,
    totalRevenue: revenue[0]?.total || 0,
    topProducts
  };
};

const getAllOrders = async (filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const orders = await Order.find(filters)
    .populate('user', 'name phone email')
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);

  const total = await Order.countDocuments(filters);

  return { orders, total, page, limit };
};

const updateOrderStatus = async (orderId, status, note = '') => {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  order.status = status;
  order.statusHistory.push({ status, timestamp: new Date(), note });
  
  if (status === 'delivered') order.deliveredAt = new Date();
  
  await order.save();
  logger.info(`Admin updated order ${orderId} to ${status}`);
  
  return order;
};

const getAllUsers = async (filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const finalFilters = {
    ...filters,
    role: 'user' // 🔐 force only normal users
  };

  const users = await User.find(finalFilters)
    .select(
      'name phone email role isActive isPhoneVerified isEmailVerified createdAt lastLogin'
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const total = await User.countDocuments(finalFilters);

  return { users, total, page, limit };
};


const toggleUserStatus = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  user.isActive = !user.isActive;
  await user.save();
  
  logger.info(`User ${userId} status toggled to ${user.isActive}`);
  
  return user;
};

module.exports = {
  getDashboardStats,
  getAllOrders,
  updateOrderStatus,
  getAllUsers,
  toggleUserStatus
};