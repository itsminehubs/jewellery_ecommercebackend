const reportsService = require('./reports.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const getGSTSummary = asyncHandler(async (req, res) => {
    const shop_id = req.headers['x-shop-id'] || req.query.shop_id;
    if (!shop_id) return ApiResponse.error('Shop ID is required', 400).send(res);
    
    const { startDate, endDate } = req.query;
    const summary = await reportsService.getGSTSummary(shop_id, startDate, endDate);
    ApiResponse.success(summary, 'GST Summary fetched successfully').send(res);
});

const getStockValuation = asyncHandler(async (req, res) => {
    const shop_id = req.headers['x-shop-id'] || req.query.shop_id;
    if (!shop_id) return ApiResponse.error('Shop ID is required', 400).send(res);

    const valuation = await reportsService.getStockValuation(shop_id);
    ApiResponse.success(valuation, 'Stock Valuation fetched successfully').send(res);
});

const getCustomerDues = asyncHandler(async (req, res) => {
    const shop_id = req.headers['x-shop-id'] || req.query.shop_id;
    const dues = await reportsService.getCustomerDues(shop_id);
    ApiResponse.success(dues, 'Customer Dues fetched successfully').send(res);
});

module.exports = {
    getGSTSummary,
    getStockValuation,
    getCustomerDues
};
