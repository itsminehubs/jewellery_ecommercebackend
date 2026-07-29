const express = require('express');
const router = express.Router();
const reportsController = require('./reports.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate);

router.get('/gst', reportsController.getGSTSummary);
router.get('/stock-valuation', reportsController.getStockValuation);
router.get('/customer-dues', reportsController.getCustomerDues);

module.exports = router;
