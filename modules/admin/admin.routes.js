const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission, checkAnyPermission } = require('../../middlewares/rbac.middleware');
const { adminLimiter } = require('../../middlewares/rateLimiter.middleware');
const { PERMISSIONS } = require('../../utils/constants');

const { uploadSingle } = require('../../middlewares/upload.middleware');

router.use(authenticate);
router.use(adminLimiter);

// Dashboard access (Anyone with an admin-like role)
router.get('/dashboard', adminController.getDashboard);

// Order Management
router.get('/orders', checkAnyPermission([PERMISSIONS.ORDER_VIEW_ALL, PERMISSIONS.ORDER_VIEW_STORE]), adminController.getAllOrders);
router.patch('/orders/:id/status', checkPermission(PERMISSIONS.ORDER_STATUS_UPDATE), adminController.updateOrderStatus);

// User/Employee Management
router.get('/users', checkAnyPermission([PERMISSIONS.CUSTOMER_VIEW, PERMISSIONS.MANAGE_EMPLOYEES]), adminController.getAllUsers);
router.post('/users', checkPermission(PERMISSIONS.MANAGE_EMPLOYEES), adminController.createEmployee);
router.patch('/users/:id', checkPermission(PERMISSIONS.MANAGE_EMPLOYEES), adminController.updateEmployee);
router.patch('/users/:id/toggle-status', checkPermission(PERMISSIONS.MANAGE_EMPLOYEES), adminController.toggleUserStatus);
router.delete('/users/:id', checkPermission(PERMISSIONS.MANAGE_EMPLOYEES), adminController.deleteUser);
router.patch('/users/:id/role', checkPermission(PERMISSIONS.MANAGE_ADMINS), adminController.updateUserRole);
router.patch('/users/:id/adjust-loyalty', checkPermission(PERMISSIONS.CUSTOMER_BLOCK), adminController.adjustLoyaltyPoints);

// Inventory & Stock
router.get('/stock-analytics', checkAnyPermission([PERMISSIONS.VIEW_GLOBAL_REPORTS, PERMISSIONS.VIEW_STORE_REPORTS]), adminController.getStockAnalytics);
router.get('/sales-reports', checkAnyPermission([PERMISSIONS.VIEW_GLOBAL_REPORTS, PERMISSIONS.VIEW_STORE_REPORTS]), adminController.getSalesReports);
router.get('/stock-list', checkPermission(PERMISSIONS.STOCK_MANAGE), adminController.getStockList);
router.get('/gross-profit', checkPermission(PERMISSIONS.VIEW_FINANCIAL_REPORTS), adminController.getGrossProfit);
router.get('/inventory-value', checkPermission(PERMISSIONS.VIEW_FINANCIAL_REPORTS), adminController.getInventoryValue);
router.post('/adjust-stock', checkPermission(PERMISSIONS.STOCK_MANAGE), adminController.adjustStock);

// Products
router.get('/bulk-export', checkAnyPermission([PERMISSIONS.PRODUCT_BULK_MANAGE, PERMISSIONS.VIEW_FINANCIAL_REPORTS]), adminController.exportProducts);
router.post('/bulk-import', checkPermission(PERMISSIONS.PRODUCT_BULK_MANAGE), uploadSingle('file'), adminController.importProducts);


module.exports = router;