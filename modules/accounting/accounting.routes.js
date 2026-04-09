const express = require('express');
const router = express.Router();
const accountingController = require('./accounting.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkAnyPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');

router.use(authenticate);

// --- DAILY CASHBOOK ROUTES ---
router.get('/cashbook/:shop_id', checkAnyPermission([PERMISSIONS.VIEW_FINANCIAL_REPORTS, PERMISSIONS.VIEW_STORE_REPORTS, PERMISSIONS.POS_VIEW_CASH_REPORTS]), accountingController.getCashbook);
router.post('/cashbook/close', checkAnyPermission([PERMISSIONS.VIEW_FINANCIAL_REPORTS, PERMISSIONS.POS_VIEW_CASH_REPORTS]), accountingController.closeDay);

// --- EXPENSE ROUTES ---
router.post('/expenses', checkAnyPermission([PERMISSIONS.VIEW_FINANCIAL_REPORTS, PERMISSIONS.POS_VIEW_CASH_REPORTS]), accountingController.createExpense);
router.get('/expenses/analytics', checkAnyPermission([PERMISSIONS.VIEW_FINANCIAL_REPORTS, PERMISSIONS.POS_VIEW_CASH_REPORTS]), accountingController.getExpenseAnalytics);

// --- LEDGER ROUTES ---
router.get('/ledger/customer/:customerId', checkAnyPermission([PERMISSIONS.VIEW_FINANCIAL_REPORTS, PERMISSIONS.CUSTOMER_VIEW]), accountingController.getCustomerStatement);
router.get('/ledger/vendor/:vendorId', checkAnyPermission([PERMISSIONS.VIEW_FINANCIAL_REPORTS, PERMISSIONS.VENDOR_MANAGE]), accountingController.getVendorStatement);

// Record a manual payment (Customer pays their bill)
router.post('/ledger/payment', checkAnyPermission([PERMISSIONS.VIEW_FINANCIAL_REPORTS, PERMISSIONS.POS_BILLING]), accountingController.recordPayment);

module.exports = router;
