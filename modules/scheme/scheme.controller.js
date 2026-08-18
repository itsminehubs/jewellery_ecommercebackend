const schemeService = require('./scheme.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const enrollCustomer = asyncHandler(async (req, res) => {
    const schemeData = {
        ...req.body,
        shop_id: req.headers['x-shop-id'] || req.body.shop_id
    };

    if (!schemeData.shop_id) {
        return ApiResponse.error('Shop ID is required', 400).send(res);
    }
    if (!schemeData.customerId) {
        return ApiResponse.error('Customer ID is required', 400).send(res);
    }

    const scheme = await schemeService.enrollCustomer(schemeData);
    ApiResponse.created(scheme, 'Customer enrolled in scheme successfully').send(res);
});

const recordInstallment = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const paymentData = req.body;
    
    if (!paymentData.amount || !paymentData.method) {
        return ApiResponse.error('Amount and payment method are required', 400).send(res);
    }

    const scheme = await schemeService.recordInstallment(schemeId, paymentData, req.user.id);
    ApiResponse.success(scheme, 'Installment recorded successfully').send(res);
});

const getStoreSchemes = asyncHandler(async (req, res) => {
    const shop_id = req.headers['x-shop-id'] || req.query.shop_id;
    if (!shop_id) {
        return ApiResponse.error('Shop ID is required', 400).send(res);
    }
    const schemes = await schemeService.getStoreSchemes(shop_id, req.query);
    ApiResponse.success(schemes, 'Schemes fetched successfully').send(res);
});

module.exports = {
    enrollCustomer,
    recordInstallment,
    getStoreSchemes
};

