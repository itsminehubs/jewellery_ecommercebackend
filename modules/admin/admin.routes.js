const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');
const { adminLimiter } = require('../../middlewares/rateLimiter.middleware');

router.use(authenticate);
router.use(isAdmin);
router.use(adminLimiter);

router.get('/dashboard', adminController.getDashboard);
router.get('/orders', adminController.getAllOrders);
router.patch('/orders/:id/status', adminController.updateOrderStatus);
router.get('/users', adminController.getAllUsers);
router.patch('/users/:id/toggle-status', adminController.toggleUserStatus);
router.get('/stock-analytics', adminController.getStockAnalytics);
router.get('/sales-reports', adminController.getSalesReports);
router.get('/stock-list', adminController.getStockList);

module.exports = router;