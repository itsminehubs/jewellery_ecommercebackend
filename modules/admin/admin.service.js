const User = require('../user/user.model');
const Product = require('../product/product.model');
const fs = require('fs');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const Order = require('../order/order.model');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

const getDashboardStats = async (shopId = null) => {
  const filter = shopId ? { shop_id: shopId } : {};
  const totalUsers = await User.countDocuments({ role: 'user' });
  const totalProducts = await Product.countDocuments();
  const totalOrders = await Order.countDocuments(filter);
  const pendingOrders = await Order.countDocuments({ ...filter, status: 'pending' });

  const revenue = await Order.aggregate([
    { $match: { ...filter, paymentStatus: 'completed' } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]);

  const totalRevenue = revenue[0]?.total || 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRevenueData = await Order.aggregate([
    { $match: { ...filter, paymentStatus: 'completed', createdAt: { $gte: today } } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]);

  const topProducts = await Product.find().sort('-sales').limit(5);

  // POS vs Online Split
  const channelSplit = await Order.aggregate([
    { $match: { ...filter, paymentStatus: 'completed' } },
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

  return { users: users || [], total, page, limit };
};

const createEmployee = async (employeeData, requesterRole) => {
  const { phone, email, name, role, password } = employeeData;
  const { USER_ROLES } = require('../../utils/constants');

  // Restriction: ADMIN can only create operational staff
  if (requesterRole === USER_ROLES.ADMIN) {
    const allowedRolesForAdmin = [
      USER_ROLES.STORE_MANAGER,
      USER_ROLES.SALES_STAFF,
      USER_ROLES.INVENTORY_STAFF,
      USER_ROLES.CUSTOMER_SUPPORT,
      USER_ROLES.MARKETING_EXECUTIVE,
      USER_ROLES.ACCOUNTS_FINANCE
    ];
    if (!allowedRolesForAdmin.includes(role)) {
      throw ApiError.forbidden('Admins can only create operational staff, not other administrators.');
    }
  }

  // Check if user already exists
  const existingUser = await User.findOne({ 
    $or: [{ phone }, { email: email?.toLowerCase() }] 
  });
  
  if (existingUser) {
    throw ApiError.badRequest('User with this phone or email already exists');
  }

  const employee = new User({
    phone,
    email: email || null,
    name,
    password, // This will be hashed by the User model's pre-save hook
    role: role || USER_ROLES.SALES_STAFF,
    isPhoneVerified: true,
    isEmailVerified: !!email,
    isActive: true
  });

  await employee.save();
  logger.info(`Admin (${requesterRole}) created new employee: ${employee._id} with role ${employee.role}`);
  
  return employee;
};

const updateEmployee = async (userId, updateData, requesterRole) => {
  const { phone, email, name, role, password } = updateData;
  const { USER_ROLES } = require('../../utils/constants');

  const targetUser = await User.findById(userId);
  if (!targetUser) throw ApiError.notFound('Employee not found');

  // Restriction: ADMIN cannot modify another ADMIN or SUPER_ADMIN
  if (requesterRole === USER_ROLES.ADMIN) {
    if (targetUser.role === USER_ROLES.ADMIN || targetUser.role === USER_ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Admins cannot modify other administrators.');
    }
    
    // Restriction: If role is being changed, ADMIN cannot promote to administrative roles
    if (role && (role === USER_ROLES.ADMIN || role === USER_ROLES.SUPER_ADMIN)) {
      throw ApiError.forbidden('Admins cannot promote users to administrative roles.');
    }
  }

  // Check unique constraints if phone or email is changing
  if (phone && phone !== targetUser.phone) {
    const phoneExists = await User.findOne({ phone, _id: { $ne: userId } });
    if (phoneExists) throw ApiError.badRequest('Phone number already in use');
    targetUser.phone = phone;
  }

  if (email && email !== targetUser.email) {
    const emailExists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
    if (emailExists) throw ApiError.badRequest('Email already in use');
    targetUser.email = email.toLowerCase();
  }

  if (name) targetUser.name = name;
  if (role) targetUser.role = role;
  if (password) targetUser.password = password; // Hashed by pre-save hook

  await targetUser.save();
  logger.info(`Admin (${requesterRole}) updated employee: ${userId}`);
  
  return targetUser;
};

const toggleUserStatus = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  user.isActive = !user.isActive;
  await user.save();

  logger.info(`User ${userId} status toggled to ${user.isActive}`);
  return user;
};

const updateUserRole = async (userId, role, requesterRole) => {
  const { USER_ROLES } = require('../../utils/constants');
  
  const targetUser = await User.findById(userId);
  if (!targetUser) throw ApiError.notFound('User not found');

  // Restriction: ADMIN cannot modify another ADMIN or SUPER_ADMIN
  if (requesterRole === USER_ROLES.ADMIN) {
    if (targetUser.role === USER_ROLES.ADMIN || targetUser.role === USER_ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Admins cannot modify roles of other administrators.');
    }
    
    // Restriction: ADMIN cannot promote someone to ADMIN or SUPER_ADMIN
    if (role === USER_ROLES.ADMIN || role === USER_ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Admins cannot promote users to administrative roles.');
    }
  }

  targetUser.role = role;
  await targetUser.save();

  logger.info(`Admin (${requesterRole}) updated user ${userId} role to ${role}`);
  return targetUser;
};

const deleteUser = async (userId, requesterRole) => {
  const { USER_ROLES } = require('../../utils/constants');
  
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  // Restriction: ADMIN cannot delete another ADMIN or SUPER_ADMIN
  if (requesterRole === USER_ROLES.ADMIN) {
    if (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Admins cannot delete other administrators.');
    }
  }

  await User.findByIdAndDelete(userId);
  
  logger.info(`Admin (${requesterRole}) deleted user: ${userId}`);
  return { message: 'User deleted successfully' };
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

const getSalesReports = async (period, shopId = null) => {
  let groupBy = {};
  const now = new Date();
  let matchStage = shopId ? { shop_id: shopId } : {};

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
  updateUserRole,
  updateEmployee,
  createEmployee,
  deleteUser,
  getStockAnalytics,
  getSalesReports,
  getStockList,
  exportProductsToCSV,
  importProductsFromCSV,
  adjustLoyaltyPoints
};