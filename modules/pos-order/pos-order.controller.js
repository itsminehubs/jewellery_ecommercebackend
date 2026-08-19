const posOrderService = require('./pos-order.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const createOrder = asyncHandler(async (req, res) => {
    const orderData = {
        ...req.body,
        billedBy: req.user.id,
        shop_id: req.headers['x-shop-id'] || req.body.shop_id
    };

    if (!orderData.shop_id) {
        return ApiResponse.error('Shop ID is required', 400).send(res);
    }

    const order = await posOrderService.createOrder(orderData);
    ApiResponse.created(order, 'Order created successfully').send(res);
});

const getStoreOrders = asyncHandler(async (req, res) => {
    const shop_id = req.headers['x-shop-id'] || req.query.shop_id;
    if (!shop_id) {
        return ApiResponse.error('Shop ID is required', 400).send(res);
    }
    const orders = await posOrderService.getStoreOrders(shop_id, req.query);
    ApiResponse.success(orders, 'Orders fetched successfully').send(res);
});

const getOrderById = asyncHandler(async (req, res) => {
    const order = await posOrderService.getOrderById(req.params.id);
    if (!order) {
        return ApiResponse.error('Order not found', 404).send(res);
    }
    ApiResponse.success(order, 'Order fetched successfully').send(res);
});

const getStoreAnalytics = asyncHandler(async (req, res) => {
    const shop_id = req.headers['x-shop-id'] || req.query.shop_id;
    const { startDate, endDate } = req.query;
    if (!shop_id || !startDate || !endDate) {
        return ApiResponse.error('Shop ID, startDate, and endDate are required', 400).send(res);
    }
    const analytics = await posOrderService.getStoreAnalytics(shop_id, startDate, endDate);
    ApiResponse.success(analytics, 'Analytics fetched successfully').send(res);
});

const processReturn = asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const returnData = req.body;
    
    if (!returnData.items || returnData.items.length === 0) {
        return ApiResponse.error('No items provided for return', 400).send(res);
    }

    const order = await posOrderService.processReturn(orderId, returnData, req.user.id);
    ApiResponse.success(order, 'Return processed successfully').send(res);
});

module.exports = {
    createOrder,
    getStoreOrders,
    getOrderById,
    getStoreAnalytics,
    processReturn
};

