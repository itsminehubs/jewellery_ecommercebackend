const Order = require('./order.model');
const Product = require('../product/product.model');
const User = require('../user/user.model');
const loyaltyService = require('../user/loyalty.service');
const couponService = require('../coupon/coupon.service');
const Coupon = require('../coupon/coupon.model');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const inventoryService = require('../product/inventory.service');

const createOrder = async (userId, orderData) => {
  const session = await Order.startSession();
  session.startTransaction();

  try {
    if (!orderData.items || orderData.items.length === 0) {
      throw ApiError.badRequest('Order items are required');
    }

    const items = [];
    let subtotal = 0;
    let totalTax = 0;

    for (const cartItem of orderData.items) {
      const product = await Product.findById(cartItem.product).session(session);

      if (!product) {
        throw ApiError.badRequest('Product not found');
      }

      if (product.stock < cartItem.quantity) {
        throw ApiError.badRequest(`${product.name} is out of stock`);
      }

      const price = product.finalPrice || product.price;
      const itemTotal = price * cartItem.quantity;

      const itemGstRate = product.gstRate || 3;
      const itemTax = itemTotal * (itemGstRate / 100);

      subtotal += itemTotal;
      totalTax += itemTax;

      items.push({
        product: product._id,
        name: product.name,
        image: product.images?.[0]?.url,
        quantity: cartItem.quantity,
        price,
        costPrice: product.purchasePrice || 0,
        gstRate: itemGstRate,
        taxAmount: itemTax
      });

      await inventoryService.updateStock(product._id, -cartItem.quantity, {
        type: 'sale',
        action: 'ITEM_SOLD',
        referenceId: null, // Will update after order save if needed, or use a temp ID
        performedBy: userId,
        session,
        notes: 'Online Store Sale'
      });
    }

    let discount = 0;
    if (orderData.couponCode) {
      const coupon = await couponService.validateCoupon(orderData.couponCode, userId, subtotal);
      discount = couponService.calculateDiscount(coupon, subtotal);
      coupon.usedCount += 1;
      await coupon.save({ session });
    }

    const shippingCost = orderData.shippingCost || 0;
    const total = subtotal + totalTax + shippingCost - discount;

    const order = new Order({
      user: userId,
      items,
      shippingAddress: orderData.shippingAddress,
      paymentMethod: orderData.paymentMethod,
      subtotal,
      tax: totalTax, // Fixed variable name from 'tax' to 'totalTax'
      shippingCost,
      discount,
      total,
      statusHistory: [{ status: 'pending', timestamp: new Date() }]
    });

    await order.save({ session });

    await User.findByIdAndUpdate(userId, { cart: [] }, { session });

    await session.commitTransaction();
    logger.info(`Order created: ${order._id}`);

    return order;
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Order creation failed: ${error.message}`);
    throw error;
  } finally {
    session.endSession();
  }
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

  // Restore stock on cancellation
  for (const item of order.items) {
    await inventoryService.updateStock(item.product, item.quantity, {
      type: 'refund',
      action: 'ORDER_CANCELLED',
      referenceId: order._id,
      performedBy: userId,
      notes: `Order ${order._id} cancelled by user`
    });
  }

  await order.save();
  logger.info(`Order cancelled and stock restored: ${orderId}`);

  // Deduct loyalty points on cancellation
  await loyaltyService.deductPoints(userId, order.total);

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
    await inventoryService.updateStock(item.product, item.quantity, {
      type: 'adjustment',
      action: 'PAYMENT_FAILURE_RESTORE',
      referenceId: order._id,
      performedBy: userId,
      notes: 'Payment failed, restoring stock'
    });
  }

  await order.deleteOne();
  logger.info(`Order deleted due to payment failure: ${orderId}`);
};

/**
 * Verify order total based on latest prices
 * @param {Array} items - List of items with product ID and quantity
 * @returns {Promise<Object>}
 */
const verifyPrice = async (items) => {
  let subtotal = 0;
  let totalTax = 0;

  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product) throw ApiError.notFound('Product not found');

    const price = product.finalPrice || product.price;
    const itemTotal = price * item.quantity;
    const itemTax = itemTotal * ((product.gstRate || 3) / 100);

    subtotal += itemTotal;
    totalTax += itemTax;
  }

  // Simplified shipping logic for verification (should match createOrder)
  const shippingCost = subtotal > 2999 ? 0 : 99;
  const total = subtotal + totalTax + shippingCost;

  return { subtotal, tax: totalTax, shippingCost, total };
};

module.exports = {
  createOrder,
  verifyPrice,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  deleteOrder,
};