const prisma = require('../../config/prisma');
const fs = require('fs');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const inventoryService = require('../product/inventory.service');
const { USER_ROLES } = require('../../utils/constants');
const { sendEmail } = require('../../jobs/email.job');
const { generateEmployeeWelcomeEmail } = require('../../utils/emailTemplates');

const getDashboardStats = async (shopId = null) => {
  const filter = {}; // Order model doesn't have storeId, so global stats only
  const totalUsers = await prisma.user.count({ where: { role: 'user' } });
  const totalProducts = await prisma.product.count({ where: { deletedAt: null } });
  const totalOrders = await prisma.order.count({ where: filter });
  const pendingOrders = await prisma.order.count({ where: { ...filter, orderStatus: 'pending' } });

  const revenue = await prisma.order.aggregate({
    where: { ...filter, paymentStatus: 'completed' },
    _sum: { grandTotal: true }
  });
  const totalRevenue = revenue._sum.grandTotal ? Number(revenue._sum.grandTotal) : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRevenueData = await prisma.order.aggregate({
    where: { ...filter, paymentStatus: 'completed', createdAt: { gte: today } },
    _sum: { grandTotal: true }
  });
  const todayRevenue = todayRevenueData._sum.grandTotal ? Number(todayRevenueData._sum.grandTotal) : 0;

  const topProducts = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: { sales: 'desc' },
    take: 5,
    include: { images: true }
  });

  // Since POS vs Online split uses 'source' field, but Prisma Order doesn't have source? 
  // Wait, in new design POSOrder is separate table from Order. 
  const channelSplit = [
    { _id: 'online', total: totalRevenue, count: totalOrders }
  ];

  return {
    totalUsers,
    totalProducts,
    totalOrders,
    pendingOrders,
    totalRevenue,
    todayRevenue,
    averageOrderValue: totalOrders > 0 ? (totalRevenue / totalOrders) : 0,
    topProducts,
    channelSplit
  };
};

const adjustLoyaltyPoints = async (userId, points, reason = 'Admin Adjustment') => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  const newPoints = (user.loyaltyPoints || 0) + Number(points);
  
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { loyaltyPoints: newPoints }
  });

  logger.info(`Admin adjusted points for ${userId}: ${points} points. Reason: ${reason}`);
  return updatedUser;
};

const getAllOrders = async (filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  // Extract source from filters
  const { source, ...prismaFilters } = filters;
  
  let finalOrders = [];
  let total = 0;

  const onlineFilters = { ...prismaFilters };
  const posFilters = { ...prismaFilters };
  
  if (prismaFilters.orderStatus) {
      posFilters.status = prismaFilters.orderStatus;
      delete posFilters.orderStatus;
  }
  if (posFilters.shop_id) {
      posFilters.storeId = posFilters.shop_id;
      delete posFilters.shop_id;
  }
  if (onlineFilters.shop_id) {
      delete onlineFilters.shop_id;
  }

  if (source === 'pos') {
    const posOrders = await prisma.pOSOrder.findMany({
      where: posFilters,
      include: {
        customer: { select: { name: true, phone: true, email: true } },
        items: { include: { product: true } },
        store: true
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    });
    total = await prisma.pOSOrder.count({ where: posFilters });
    
    finalOrders = posOrders.map(po => ({
        ...po,
        source: 'pos',
        orderStatus: po.status,
        user: po.customer,
        shop_id: po.store?.name || po.storeId
    }));
  } else if (source === 'online') {
    const orders = await prisma.order.findMany({
      where: onlineFilters,
      include: { 
        user: { select: { name: true, phone: true, email: true } },
        items: { include: { product: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    });
    total = await prisma.order.count({ where: onlineFilters });
    
    finalOrders = orders.map(o => ({ ...o, source: 'online' }));
  } else {
    const fetchLimit = skip + Number(limit);
    const [onlineOrders, posOrdersRaw] = await Promise.all([
      prisma.order.findMany({
        where: onlineFilters,
        include: { 
          user: { select: { name: true, phone: true, email: true } },
          items: { include: { product: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: fetchLimit
      }),
      prisma.pOSOrder.findMany({
        where: posFilters,
        include: {
          customer: { select: { name: true, phone: true, email: true } },
          items: { include: { product: true } },
          store: true
        },
        orderBy: { createdAt: 'desc' },
        take: fetchLimit
      })
    ]);
    
    const mappedOnline = onlineOrders.map(o => ({ ...o, source: 'online' }));
    const mappedPos = posOrdersRaw.map(po => ({
        ...po,
        source: 'pos',
        orderStatus: po.status,
        user: po.customer,
        shop_id: po.store?.name || po.storeId
    }));
    
    const combined = [...mappedOnline, ...mappedPos].sort((a, b) => b.createdAt - a.createdAt);
    finalOrders = combined.slice(skip, skip + Number(limit));
    
    const [onlineCount, posCount] = await Promise.all([
        prisma.order.count({ where: onlineFilters }),
        prisma.pOSOrder.count({ where: posFilters })
    ]);
    total = onlineCount + posCount;
  }

  return { orders: finalOrders, total, page, limit };
};

const updateOrderStatus = async (orderId, status, note = '') => {
  let order = await prisma.order.findUnique({ where: { id: orderId } });
  if (order) {
      const updateData = { orderStatus: status };
      if (status === 'DELIVERED' || status === 'delivered') updateData.deliveredAt = new Date();
    
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: updateData
      });
      logger.info(`Admin updated order ${orderId} to ${status}`);
      return updatedOrder;
  }
  
  let posOrder = await prisma.pOSOrder.findUnique({ where: { id: orderId } });
  if (posOrder) {
      const updatedPosOrder = await prisma.pOSOrder.update({
          where: { id: orderId },
          data: { status: status.toLowerCase(), notes: note || posOrder.notes }
      });
      
      if (['cancelled', 'refunded'].includes(status.toLowerCase()) && !['cancelled', 'refunded'].includes(posOrder.status.toLowerCase())) {
         const inventoryService = require('../product/inventory.service');
         const posItems = await prisma.pOSOrderItem.findMany({ where: { posOrderId: orderId } });
         for (const item of posItems) {
            await inventoryService.updateStock(item.productId, item.quantity, {
                type: 'refund',
                action: 'POS_RETURN',
                referenceId: orderId,
                performedBy: 'ADMIN',
                notes: `POS Order ${status}`
            });
         }
      }
      logger.info(`Admin updated POS order ${orderId} to ${status}`);
      return { ...updatedPosOrder, source: 'pos', orderStatus: updatedPosOrder.status };
  }
  throw ApiError.notFound('Order not found');
};

const getAllUsers = async (filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  filters.deletedAt = null;

  const users = await prisma.user.findMany({
    where: filters,
    select: {
      id: true, name: true, phone: true, email: true, role: true, 
      isActive: true, isPhoneVerified: true, isEmailVerified: true, 
      createdAt: true, lastLogin: true
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: Number(limit)
  });

  const total = await prisma.user.count({ where: filters });
  return { users, total, page, limit };
};

const getUserDetails = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { addresses: true }
  });

  if (!user) throw ApiError.notFound('User not found');

  const orders = await prisma.order.findMany({
    where: { userId },
    include: {
      items: {
        include: { product: true }
      }
    }
  });

  const totalOrders = orders.length;
  const totalSpent = orders.reduce((acc, order) => acc + Number(order.grandTotal || 0), 0);
  
  const sortedOrders = [...orders].sort((a, b) => b.createdAt - a.createdAt);
  const lastOrder = sortedOrders.length > 0 ? sortedOrders[0].createdAt : null;

  const wishlistItems = await prisma.wishlistItem.count({
    where: { userId }
  });

  return {
    ...user,
    totalOrders,
    totalSpent,
    wishlistItems,
    lastOrder,
    joinedDate: user.createdAt,
    addresses: user.addresses || [],
    orders: sortedOrders
  };
};

const createEmployee = async (employeeData, requesterRole) => {
  const { phone, email, name, role, password } = employeeData;

  if (!name || !email) {
    throw ApiError.badRequest('Name and Email ID are mandatory for creating a new employee.');
  }

  if (requesterRole === USER_ROLES.ADMIN) {
    const allowedRolesForAdmin = [
      USER_ROLES.STORE_MANAGER, USER_ROLES.SALES_STAFF, USER_ROLES.INVENTORY_STAFF,
      USER_ROLES.CUSTOMER_SUPPORT, USER_ROLES.MARKETING_EXECUTIVE,
      USER_ROLES.ACCOUNTS_FINANCE, USER_ROLES.USER
    ];
    if (!allowedRolesForAdmin.includes(role)) {
      throw ApiError.forbidden('Admins can only create operational staff.');
    }
  }

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ phone }, { email: email?.toLowerCase() }] }
  });

  if (existingUser) {
    throw ApiError.badRequest('User with this phone or email already exists');
  }

  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 10);

  const employee = await prisma.user.create({
    data: {
      phone,
      email: email?.toLowerCase() || null,
      name,
      password: hashedPassword,
      role: role || USER_ROLES.SALES_STAFF,
      isPhoneVerified: true,
      isEmailVerified: !!email,
      isActive: true
    }
  });

  logger.info(`Admin (${requesterRole}) created new employee: ${employee.id} with role ${employee.role}`);

  const loginUrl = process.env.POS_URL || 'https://pos.thecarbonsmith.com';
  const emailContent = generateEmployeeWelcomeEmail(employee, password, loginUrl);
  
  if (employee.email) {
    await sendEmail({
      to: employee.email,
      emailType: 'ops',
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });
  }

  return employee;
};

const updateEmployee = async (userId, updateData, requesterRole) => {
  const { phone, email, name, role, password } = updateData;

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) throw ApiError.notFound('Employee not found');

  if (requesterRole === USER_ROLES.ADMIN) {
    if (targetUser.role === USER_ROLES.ADMIN || targetUser.role === USER_ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Admins cannot modify other administrators.');
    }
    if (role && (role === USER_ROLES.ADMIN || role === USER_ROLES.SUPER_ADMIN)) {
      throw ApiError.forbidden('Admins cannot promote users to administrative roles.');
    }
  }

  const updateFields = {};

  if (phone && phone !== targetUser.phone) {
    const phoneExists = await prisma.user.findFirst({ where: { phone, id: { not: userId } } });
    if (phoneExists) throw ApiError.badRequest('Phone number already in use');
    updateFields.phone = phone;
  }

  if (email && email.toLowerCase() !== targetUser.email) {
    const emailExists = await prisma.user.findFirst({ where: { email: email.toLowerCase(), id: { not: userId } } });
    if (emailExists) throw ApiError.badRequest('Email already in use');
    updateFields.email = email.toLowerCase();
  }

  if (name) updateFields.name = name;
  if (role) updateFields.role = role;
  
  if (password) {
      const bcrypt = require('bcryptjs');
      updateFields.password = await bcrypt.hash(password, 10);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateFields
  });

  logger.info(`Admin (${requesterRole}) updated employee: ${userId}`);
  return updatedUser;
};

const toggleUserStatus = async (userId, requesterRole) => {
  if (requesterRole !== USER_ROLES.ADMIN && requesterRole !== USER_ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only administrators can activate or deactivate accounts.');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive }
  });

  logger.info(`User ${userId} status toggled to ${updatedUser.isActive}`);
  return updatedUser;
};

const updateUserRole = async (userId, role, requesterRole) => {
  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) throw ApiError.notFound('User not found');

  if (requesterRole === USER_ROLES.ADMIN) {
    if (targetUser.role === USER_ROLES.ADMIN || targetUser.role === USER_ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Admins cannot modify roles of other administrators.');
    }
    if (role === USER_ROLES.ADMIN || role === USER_ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Admins cannot promote users to administrative roles.');
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { role }
  });

  logger.info(`Admin (${requesterRole}) updated user ${userId} role to ${role}`);
  return updatedUser;
};

const deleteUser = async (userId, requesterRole) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  if (requesterRole === USER_ROLES.ADMIN) {
    if (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Admins cannot delete other administrators.');
    }
  }

  // Soft delete user to preserve order history
  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      deletedAt: new Date()
    }
  });

  logger.info(`Admin (${requesterRole}) deleted user: ${userId}`);
  return { message: 'User deleted successfully' };
};

const getStockAnalytics = async () => {
  const stats = await prisma.product.aggregate({
    where: { deletedAt: null },
    _sum: { stock: true }
  });
  
  // For total value, we need db.$queryRaw because it's stock * price
  const queryResult = await prisma.$queryRaw`SELECT SUM(stock * "finalPrice") as "totalValue" FROM "Product" WHERE "deletedAt" IS NULL`;
  const totalValue = queryResult[0]?.totalValue || 0;
  
  const lowStockCount = await prisma.product.count({
    where: { stock: { lt: 5 }, deletedAt: null }
  });

  const dispatchedOrders = await prisma.order.count({
    where: { orderStatus: { in: ['shipped', 'delivered'] } }
  });

  const categoryStockRaw = await prisma.$queryRaw`
    SELECT 
      c.id as "categoryId",
      c.name as name,
      CAST(SUM(p.stock) AS INTEGER) as count,
      SUM(p.stock * p."finalPrice") as value
    FROM "Product" p
    LEFT JOIN "Category" c ON p."categoryId" = c.id
    WHERE p."deletedAt" IS NULL
    GROUP BY c.id, c.name
  `;

  const categoryStock = categoryStockRaw.map(c => ({
      categoryId: c.categoryId,
      name: c.name || 'Unknown',
      count: Number(c.count || 0),
      value: Number(c.value || 0)
  }));

  return {
    totalStock: stats._sum.stock || 0,
    totalValue: Number(totalValue),
    lowStockCount,
    dispatchedOrders,
    categoryStock
  };
};

const getSalesReports = async (period, shopId = null) => {
    // Requires raw SQL for date truncations in Prisma
    let truncFormat = 'day';
    let interval = '30 days';

    if (period === 'weekly') { truncFormat = 'week'; interval = '90 days'; }
    else if (period === 'monthly') { truncFormat = 'month'; interval = '1 year'; }
    else if (period === 'yearly') { truncFormat = 'year'; interval = '10 years'; }

    const storeFilter = shopId ? `AND "storeId" = '${shopId}'` : '';
    
    const query = `
      SELECT DATE_TRUNC('${truncFormat}', "createdAt") as "_id", 
             SUM("grandTotal") as "totalSales", 
             COUNT(id) as "orderCount"
      FROM "Order"
      WHERE "paymentStatus" = 'completed'
        AND "createdAt" >= NOW() - INTERVAL '${interval}'
        ${storeFilter}
      GROUP BY DATE_TRUNC('${truncFormat}', "createdAt")
      ORDER BY "_id" ASC
    `;

    const result = await prisma.$queryRawUnsafe(query);
    
    return result.map(r => ({
        _id: r.id,
        totalSales: Number(r.totalSales),
        orderCount: Number(r.orderCount)
    }));
};

const getStockList = async (options = {}) => {
  const { page = 1, limit = 20, search, category, status } = options;
  const skip = (page - 1) * limit;

  const where = { deletedAt: null };

  if (search) {
    where.OR = [
      { sku: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ];
  }

  if (category) {
      where.category = { slug: category };
  }

  if (status) {
    if (status === 'low_stock') where.stock = { lte: 5, gt: 0 };
    else if (status === 'out_of_stock') where.stock = 0;
    else if (status === 'in_stock') where.stock = { gt: 5 };
  }

  const products = await prisma.product.findMany({
    where,
    select: { id: true, name: true, sku: true, categoryId: true, metalDetails: true, stock: true, price: true, purchasePrice: true, finalPrice: true, status: true, images: true },
    orderBy: status === 'low_stock' ? { stock: 'asc' } : { updatedAt: 'desc' },
    skip,
    take: Number(limit)
  });

  const total = await prisma.product.count({ where });

  return { products, total, page: Number(page), limit: Number(limit) };
};

const exportProductsToCSV = async () => {
  const products = await prisma.product.findMany({ where: { deletedAt: null } });

  if (!products.length) return '';

  const fields = [
    'sku', 'name', 'categoryId', 'metalType', 'purity',
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
  const summary = { total: 0, created: 0, updated: 0, errors: [] };

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        summary.total = results.length;

        for (const row of results) {
          try {
            const { sku, name, categoryId, metalType, price, stock } = row;

            if (!name || !categoryId || !metalType || !price) {
              summary.errors.push({ row, error: 'Missing required fields' });
              continue;
            }

            const productData = {
              name,
              categoryId,
              metalType,
              price: Number(price),
              stock: Number(stock || 0),
              discount: Number(row.discount || 0),
              purity: row.purity,
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
              isFeatured: row.isFeatured === 'true',
              isTrending: row.isTrending === 'true'
            };

            if (sku && sku.trim() !== '') {
                const existing = await prisma.product.findUnique({ where: { sku: sku.trim() } });
                if (existing) {
                    await prisma.product.update({ where: { sku: sku.trim() }, data: productData });
                    summary.updated++;
                    continue;
                }
                productData.sku = sku.trim();
            }

            await prisma.product.create({ data: productData });
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

const adjustStock = async (productId, quantityChange, userId, notes) => {
  return await inventoryService.updateStock(productId, quantityChange, {
    type: 'adjustment',
    action: 'MANUAL_ADJUSTMENT',
    referenceId: userId,
    performedBy: userId,
    notes: notes || 'Manual inventory adjustment'
  });
};


const deleteOrder = async (orderId, adminId) => {
  const inventoryService = require('../product/inventory.service');
  
  let order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
  });
  if (order) {
      for (const item of order.items) {
          if (item.productId) {
              try {
                  await inventoryService.updateStock(item.productId, item.quantity, {
                      type: 'adjustment',
                      action: 'ADMIN_DELETE_ORDER',
                      performedBy: adminId,
                      notes: 'Restored stock from deleted order'
                  });
              } catch (e) {
                  console.warn('Could not restore stock:', e.message);
              }
          }
      }
      await prisma.orderItem.deleteMany({ where: { orderId: orderId } });
      await prisma.order.delete({ where: { id: orderId } });
      logger.info(`Admin ${adminId} deleted order ${orderId}`);
      return true;
  }
  
  let posOrder = await prisma.pOSOrder.findUnique({
      where: { id: orderId },
      include: { items: true }
  });
  if (posOrder) {
      for (const item of posOrder.items) {
          if (item.productId) {
              try {
                  await inventoryService.updateStock(item.productId, item.quantity, {
                      type: 'adjustment',
                      action: 'ADMIN_DELETE_POS_ORDER',
                      performedBy: adminId,
                      notes: 'Restored stock from deleted POS bill'
                  });
              } catch (e) {
                  console.warn('Could not restore stock:', e.message);
              }
          }
      }
      await prisma.pOSOrderItem.deleteMany({ where: { posOrderId: orderId } });
      await prisma.pOSOrder.delete({ where: { id: orderId } });
      logger.info(`Admin ${adminId} deleted POS order ${orderId}`);
      return true;
  }
  throw ApiError.notFound('Order not found');
};

const updateOrderDetails = async (orderId, updateData) => {
  let order = await prisma.order.findUnique({ where: { id: orderId } });
  if (order) {
      const data = {};
      if (updateData.paymentStatus) data.paymentStatus = updateData.paymentStatus;
      if (updateData.orderNumber) data.orderNumber = updateData.orderNumber;
      if (updateData.shippingAddress) {
          data.shippingAddress = updateData.shippingAddress;
      }
      const updatedOrder = await prisma.order.update({
          where: { id: orderId },
          data
      });
      logger.info(`Admin updated order details for ${orderId}`);
      return updatedOrder;
  }
  
  let posOrder = await prisma.pOSOrder.findUnique({ where: { id: orderId } });
  if (posOrder) {
      const data = {};
      if (updateData.orderNumber) data.orderNumber = updateData.orderNumber;
      const updatedPosOrder = await prisma.pOSOrder.update({
          where: { id: orderId },
          data
      });
      logger.info(`Admin updated POS order details for ${orderId}`);
      return { ...updatedPosOrder, source: 'pos' };
  }

  throw ApiError.notFound('Order not found');
};

module.exports = {
  getDashboardStats,
  adjustLoyaltyPoints,
  getAllOrders,
  updateOrderStatus,
  updateOrderDetails,
  deleteOrder,
  getAllUsers,
  getUserDetails,
  updateEmployee,
  createEmployee,
  deleteUser,
  toggleUserStatus,
  updateUserRole,
  getStockAnalytics,
  getSalesReports,
  getStockList,
  exportProductsToCSV,
  importProductsFromCSV,
  adjustStock
};
