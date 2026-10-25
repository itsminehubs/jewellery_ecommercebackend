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
router.patch('/orders/:id/details', checkPermission(PERMISSIONS.ORDER_MODIFY), adminController.updateOrderDetails);
router.delete('/orders/:id', checkPermission(PERMISSIONS.ORDER_CANCEL), adminController.deleteOrder);

// User/Employee Management
router.get('/users', checkAnyPermission([PERMISSIONS.CUSTOMER_VIEW, PERMISSIONS.MANAGE_EMPLOYEES]), adminController.getAllUsers);
router.get('/users/:id', checkPermission(PERMISSIONS.CUSTOMER_VIEW), adminController.getUserDetails);
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

// Alias to update product via /admin/products/:id
const productController = require('../product/product.controller');
const { productImageUpload } = require('../../middlewares/upload.middleware');
const validate = require('../../middlewares/validate.middleware');
const productValidation = require('../../validations/product.validation');

const parseProductData = (req, res, next) => {
    const fieldsToParse = ['metalDetails', 'stoneDetails', 'basicDetails', 'categoryAttributes', 'specifications'];
    fieldsToParse.forEach(field => {
        if (req.body[field] && typeof req.body[field] === 'string') {
            try {
                req.body[field] = JSON.parse(req.body[field]);
            } catch (error) {
                console.warn(`Failed to parse ${field}:`, error.message);
            }
        }
    });
    next();
};

router.put('/products/:id', checkPermission(PERMISSIONS.PRODUCT_EDIT), productImageUpload, parseProductData, validate(productValidation.updateProduct), productController.updateProduct);
router.patch('/products/:id', checkPermission(PERMISSIONS.PRODUCT_EDIT), productImageUpload, parseProductData, validate(productValidation.updateProduct), productController.updateProduct);

module.exports = router;