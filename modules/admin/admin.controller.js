const adminService = require('./admin.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');
const ApiError = require('../../utils/ApiError');
const financeService = require('./finance.service');

const adjustLoyaltyPoints = asyncHandler(async (req, res) => {
  const { points, reason } = req.body;
  const user = await adminService.adjustLoyaltyPoints(req.params.id, points, reason);
  ApiResponse.success(user, 'Loyalty points adjusted successfully').send(res);
});

const getDashboard = asyncHandler(async (req, res) => {
  const { shopId } = req.query;
  const stats = await adminService.getDashboardStats(shopId);
  ApiResponse.success(stats, 'Dashboard stats fetched').send(res);
});

const getAllOrders = asyncHandler(async (req, res) => {
  // Extract pagination from query
  const { page = 1, limit = 20, ...filters } = req.query;

  const result = await adminService.getAllOrders(filters, {
    page: parseInt(page),
    limit: parseInt(limit)
  });

  ApiResponse.paginated(result.orders, result.page, result.limit, result.total).send(res);
});


const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const order = await adminService.updateOrderStatus(req.params.id, status, note);
  ApiResponse.success(order, 'Order status updated').send(res);
});

const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, isActive } = req.query;

  const filters = {};
  if (role) filters.role = role;
  if (isActive !== undefined) filters.isActive = isActive === 'true';

  const options = { page, limit };

  const result = await adminService.getAllUsers(filters, options);

  ApiResponse.paginated(
    result.users,
    result.page,
    result.limit,
    result.total
  ).send(res);
});


const updateEmployee = asyncHandler(async (req, res) => {
  const user = await adminService.updateEmployee(req.params.id, req.body, req.user.role);
  ApiResponse.success(user, 'Employee updated successfully').send(res);
});

const toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await adminService.toggleUserStatus(req.params.id);
  ApiResponse.success(user, 'User status updated').send(res);
});

const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const user = await adminService.updateUserRole(req.params.id, role, req.user.role);
  ApiResponse.success(user, 'User role updated').send(res);
});

const deleteUser = asyncHandler(async (req, res) => {
  await adminService.deleteUser(req.params.id);
  ApiResponse.success(null, 'User deleted successfully').send(res);
});

const getStockAnalytics = asyncHandler(async (req, res) => {
  const stats = await adminService.getStockAnalytics();
  ApiResponse.success(stats, 'Stock analytics fetched').send(res);
});

const getSalesReports = asyncHandler(async (req, res) => {
  const { period, shopId } = req.query; // daily, weekly, monthly, yearly
  const reports = await adminService.getSalesReports(period || 'monthly', shopId);
  ApiResponse.success(reports, 'Sales reports fetched').send(res);
});

const getStockList = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, category, status } = req.query;
  const result = await adminService.getStockList({
    page, limit, search, category, status
  });
  ApiResponse.paginated(result.products, result.page, result.limit, result.total).send(res);
});

const exportProducts = asyncHandler(async (req, res) => {
  const csvContent = await adminService.exportProductsToCSV();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=products_export_${Date.now()}.csv`);
  res.status(200).send(csvContent);
});

const importProducts = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('Please upload a CSV file');
  }
  const result = await adminService.importProductsFromCSV(req.file.path);
  ApiResponse.success(result, 'Bulk import completed').send(res);
});

const createEmployee = asyncHandler(async (req, res) => {
  const employee = await adminService.createEmployee(req.body, req.user.role);
  ApiResponse.success(employee, 'Employee created successfully').send(res);
});

const getGrossProfit = asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
        throw ApiError.badRequest('StartDate and EndDate are required (YYYY-MM-DD)');
    }
    const profitData = await financeService.calculateGrossProfit(startDate, endDate);
    ApiResponse.success(profitData, 'Gross profit analytics fetched').send(res);
});

const getInventoryValue = asyncHandler(async (req, res) => {
    const valueData = await financeService.calculateInventoryValue();
    ApiResponse.success(valueData, 'Total inventory valuation fetched').send(res);
});

const adjustStock = asyncHandler(async (req, res) => {
    const { productId, quantityChange, notes } = req.body;
    if (quantityChange === 0) {
        throw ApiError.badRequest('Quantity change cannot be zero');
    }
    const product = await adminService.adjustStock(productId, quantityChange, req.user._id, notes);
    ApiResponse.success(product, 'Inventory adjusted successfully').send(res);
});

module.exports = {
  getDashboard,
  getAllOrders,
  updateOrderStatus,
  getAllUsers,
  toggleUserStatus,
  updateUserRole,
  getStockAnalytics,
  getSalesReports,
  getStockList,
  exportProducts,
  importProducts,
  updateEmployee,
  adjustLoyaltyPoints,
  createEmployee,
  deleteUser,
  getGrossProfit,
  getInventoryValue,
  adjustStock
};