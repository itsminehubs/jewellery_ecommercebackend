const adminService = require('./admin.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const getDashboard = asyncHandler(async (req, res) => {
  const stats = await adminService.getDashboardStats();
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


const toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await adminService.toggleUserStatus(req.params.id);
  ApiResponse.success(user, 'User status updated').send(res);
});

const getStockAnalytics = asyncHandler(async (req, res) => {
  const stats = await adminService.getStockAnalytics();
  ApiResponse.success(stats, 'Stock analytics fetched').send(res);
});

const getSalesReports = asyncHandler(async (req, res) => {
  const { period } = req.query; // daily, weekly, monthly, yearly
  const reports = await adminService.getSalesReports(period || 'monthly');
  ApiResponse.success(reports, 'Sales reports fetched').send(res);
});

const getStockList = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, category, status } = req.query;
  const result = await adminService.getStockList({
    page, limit, search, category, status
  });
  ApiResponse.paginated(result.products, result.page, result.limit, result.total).send(res);
});

module.exports = {
  getDashboard,
  getAllOrders,
  updateOrderStatus,
  getAllUsers,
  toggleUserStatus,
  getStockAnalytics,
  getSalesReports,
  getStockList
};