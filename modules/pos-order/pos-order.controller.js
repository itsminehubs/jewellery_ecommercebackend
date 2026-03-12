const posOrderService = require('./pos-order.service');

const createOrder = async (req, res) => {
    try {
        const orderData = {
            ...req.body,
            billedBy: req.user._id,
            shop_id: req.headers['x-shop-id'] || req.body.shop_id // Get shop_id from header or body
        };

        if (!orderData.shop_id) {
            return res.status(400).json({ success: false, message: 'Shop ID is required' });
        }

        const order = await posOrderService.createOrder(orderData);
        res.status(201).json({ success: true, data: order });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const getStoreOrders = async (req, res) => {
    try {
        const shop_id = req.headers['x-shop-id'] || req.query.shop_id;
        if (!shop_id) {
            return res.status(400).json({ success: false, message: 'Shop ID is required' });
        }
        const orders = await posOrderService.getStoreOrders(shop_id, req.query);
        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getOrderById = async (req, res) => {
    try {
        const order = await posOrderService.getOrderById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getStoreAnalytics = async (req, res) => {
    try {
        const shop_id = req.headers['x-shop-id'] || req.query.shop_id;
        const { startDate, endDate } = req.query;
        if (!shop_id || !startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'Shop ID, startDate, and endDate are required' });
        }
        const analytics = await posOrderService.getStoreAnalytics(shop_id, startDate, endDate);
        res.status(200).json({ success: true, data: analytics });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createOrder,
    getStoreOrders,
    getOrderById,
    getStoreAnalytics
};
