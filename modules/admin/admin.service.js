const User = require('../user/user.model');
const Product = require('../product/product.model');
const fs = require('fs');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
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

  const totalRevenue = revenue[0]?.total || 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRevenueData = await Order.aggregate([
    { $match: { paymentStatus: 'completed', createdAt: { $gte: today } } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]);

  const topProducts = await Product.find().sort('-sales').limit(5);

  // POS vs Online Split
  const channelSplit = await Order.aggregate([
    { $match: { paymentStatus: 'completed' } },
    { $group: { _id: '$source', total: { $sum: '$total' }, count: { $sum: 1 } } }
  ]);

  return {
    totalUsers,
    totalProducts,
    totalOrders,
    pendingOrders,
    totalRevenue,
    todayRevenue: todayRevenueData[0]?.total || 0,
    averageOrderValue: totalOrders > 0 ? (totalRevenue / totalOrders) : 0,
    topProducts,
    channelSplit
  };
};

const adjustLoyaltyPoints = async (userId, points, reason = 'Admin Adjustment') => {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  user.loyaltyPoints = (user.loyaltyPoints || 0) + Number(points);
  
  // LOG THE ADJUSTMENT (In a real system, we'd have a LoyaltyHistory model)
  logger.info(`Admin adjusted points for ${userId}: ${points} points. Reason: ${reason}`);

  await user.save();
  return user;
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

const getStockAnalytics = async () => {
  // 1. Total Stock & Value
  const stockStats = await Product.aggregate([
    {
      $group: {
        _id: null,
        totalStock: { $sum: '$stock' },
        totalValue: { $sum: { $multiply: ['$price', '$stock'] } },
        lowStockCount: {
          $sum: { $cond: [{ $lt: ['$stock', 5] }, 1, 0] }
        }
      }
    }
  ]);

  // 2. Dispatched Orders (Shipped/Delivered)
  const dispatchedOrders = await Order.countDocuments({
    status: { $in: ['shipped', 'delivered'] }
  });

  // 3. Category-wise Stock
  const categoryStock = await Product.aggregate([
    {
      $group: {
        _id: '$category',
        count: { $sum: '$stock' },
        value: { $sum: { $multiply: ['$price', '$stock'] } }
      }
    }
  ]);

  return {
    totalStock: stockStats[0]?.totalStock || 0,
    totalValue: stockStats[0]?.totalValue || 0,
    lowStockCount: stockStats[0]?.lowStockCount || 0,
    dispatchedOrders,
    categoryStock
  };
};

const getSalesReports = async (period) => {
  let groupBy = {};
  const now = new Date();
  let matchStage = {};

  if (period === 'daily') {
    matchStage = {
      createdAt: {
        $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
      }
    };
    groupBy = {
      $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
    };
  } else if (period === 'weekly') {
    matchStage = {
      createdAt: {
        $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90)
      }
    };
    groupBy = {
      $dateToString: { format: "%Y-%U", date: "$createdAt" }
    };
  } else if (period === 'monthly') {
    matchStage = {
      createdAt: {
        $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1)
      }
    };
    groupBy = {
      $dateToString: { format: "%Y-%m", date: "$createdAt" }
    };
  } else if (period === 'yearly') {
    groupBy = {
      $dateToString: { format: "%Y", date: "$createdAt" }
    };
  }

  const salesData = await Order.aggregate([
    { $match: { ...matchStage, paymentStatus: 'completed' } }, // Only paid orders
    {
      $group: {
        _id: groupBy,
        totalSales: { $sum: '$total' },
        orderCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return salesData;
};

const getStockList = async (options = {}) => {
  const { page = 1, limit = 20, search, category, status } = options;
  const skip = (page - 1) * limit;

  const query = {};

  if (search) {
    query.$text = { $search: search };
  }

  if (category) {
    query.category = category;
  }

  if (status) {
    if (status === 'low_stock') {
      query.stock = { $lte: 5, $gt: 0 };
    } else if (status === 'out_of_stock') {
      query.stock = 0;
    } else if (status === 'in_stock') {
      query.stock = { $gt: 5 };
    }
  }

  const stockList = await Product.find(query)
    .select('name category stock price images status')
    .sort(status === 'low_stock' ? 'stock' : '-updatedAt')
    .skip(skip)
    .limit(Number(limit));

  const total = await Product.countDocuments(query);

  return { products: stockList, total, page: Number(page), limit: Number(limit) };
};

const exportProductsToCSV = async () => {
  const products = await Product.find().lean();

  if (!products.length) return '';

  const fields = [
    'sku', 'name', 'category', 'metalType', 'purity',
    'grossWeight', 'stoneWeight', 'netWeight',
    'makingCharges', 'makingChargeType', 'stoneCharges', 'wastage',
    'price', 'discount', 'stock', 'status', 'featured', 'trending',
    'hsnCode', 'gstRate'
  ];

  const json2csvParser = new Parser({ fields });
  const csv = json2csvParser.parse(products);

  return csv;
};

const importProductsFromCSV = async (filePath) => {
  const results = [];
  const summary = {
    total: 0,
    created: 0,
    updated: 0,
    errors: []
  };

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        summary.total = results.length;

        for (const row of results) {
          try {
            const { sku, name, category, metalType, price, stock } = row;

            if (!name || !category || !metalType || !price) {
              summary.errors.push({ row, error: 'Missing required fields' });
              continue;
            }

            const productData = {
              name,
              category,
              metalType,
              price: Number(price),
              stock: Number(stock || 0),
              discount: Number(row.discount || 0),
              purity: row.purity,
              weight: Number(row.weight || 0),
              grossWeight: Number(row.grossWeight || row.weight || 0),
              stoneWeight: Number(row.stoneWeight || 0),
              netWeight: Number(row.netWeight || row.weight || 0),
              makingCharges: Number(row.makingCharges || 0),
              makingChargeType: row.makingChargeType || 'per_gram',
              stoneCharges: Number(row.stoneCharges || 0),
              wastage: Number(row.wastage || 0),
              hsnCode: row.hsnCode || '7113',
              gstRate: Number(row.gstRate || 3),
              status: row.status || 'active',
              featured: row.featured === 'true',
              trending: row.trending === 'true'
            };

            if (sku) {
              const updated = await Product.findOneAndUpdate(
                { sku: sku.trim() },
                productData,
                { new: true, runValidators: true }
              );

              if (updated) {
                summary.updated++;
                continue;
              }
            }

            // Create new if no SKU or SKU not found
            await Product.create(productData);
            summary.created++;

          } catch (error) {
            summary.errors.push({ row, error: error.message });
          }
        }
        resolve(summary);
      })
      .on('error', (error) => reject(error));
  });
};

module.exports = {
  getDashboardStats,
  getAllOrders,
  updateOrderStatus,
  getAllUsers,
  toggleUserStatus,
  getStockAnalytics,
  getSalesReports,
  getStockList,
  exportProductsToCSV,
  importProductsFromCSV,
  adjustLoyaltyPoints
};