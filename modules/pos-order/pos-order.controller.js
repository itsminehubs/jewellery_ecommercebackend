const posOrderService = require('./pos-order.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { asyncHandler } = require('../../middlewares/error.middleware');

const createOrder = asyncHandler(async (req, res) => {
    const orderData = {
        ...req.body,
        billedBy: req.user.id,
        shop_id: req.headers['x-shop-id'] || req.body.shop_id
    };

    if (!orderData.shop_id) {
        throw new ApiError(400, 'Shop ID is required');
    }

    const order = await posOrderService.createOrder(orderData);
    ApiResponse.created(order, 'Order created successfully').send(res);
});

const getStoreOrders = asyncHandler(async (req, res) => {
    const shop_id = req.headers['x-shop-id'] || req.query.shop_id;
    if (!shop_id) {
        throw new ApiError(400, 'Shop ID is required');
    }
    const orders = await posOrderService.getStoreOrders(shop_id, req.query);
    ApiResponse.success(orders, 'Orders fetched successfully').send(res);
});

const getOrderById = asyncHandler(async (req, res) => {
    const order = await posOrderService.getOrderById(req.params.id);
    if (!order) {
        throw new ApiError(404, 'Order not found');
    }
    ApiResponse.success(order, 'Order fetched successfully').send(res);
});

const getStoreAnalytics = asyncHandler(async (req, res) => {
    let shop_id = req.headers['x-shop-id'] || req.query.shop_id;
    if (shop_id === 'all' || shop_id === 'undefined' || !shop_id) {
        shop_id = null;
    }
    const { startDate, endDate, includeOnline } = req.query;
    if (!startDate || !endDate) {
        throw new ApiError(400, 'startDate and endDate are required');
    }
    const analytics = await posOrderService.getStoreAnalytics(shop_id, startDate, endDate, includeOnline === 'true');
    ApiResponse.success(analytics, 'Analytics fetched successfully').send(res);
});

const processReturn = asyncHandler(async (req, res) => {
    const orderId = req.params.id;
    const returnData = req.body;
    
    if (!returnData.items || returnData.items.length === 0) {
        throw new ApiError(400, 'No items provided for return');
    }

    const order = await posOrderService.processReturn(orderId, returnData, req.user.id);
    ApiResponse.success(order, 'Return processed successfully').send(res);
});

const calculateCart = asyncHandler(async (req, res) => {
    const { items, storeId } = req.body;
    
    if (!items || !Array.isArray(items)) {
        throw new ApiError(400, 'Items array is required');
    }

    const calculatedCart = await posOrderService.calculateCartPrice(items, storeId);
    ApiResponse.success(calculatedCart, 'Cart calculated successfully').send(res);
});

const updateOrder = asyncHandler(async (req, res) => {
    const orderData = {
        ...req.body,
        billedBy: req.user.id,
        shop_id: req.headers['x-shop-id'] || req.body.shop_id
    };

    if (!orderData.shop_id) {
        throw new ApiError(400, 'Shop ID is required');
    }

    const order = await posOrderService.updateOrder(req.params.id, orderData);
    ApiResponse.success(order, 'Order updated successfully').send(res);
});

module.exports = {
    createOrder,
    updateOrder,
    getStoreOrders,
    getOrderById,
    getStoreAnalytics,
    processReturn,
    calculateCart
};

