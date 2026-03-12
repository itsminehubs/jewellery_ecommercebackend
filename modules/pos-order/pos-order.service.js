const POSOrder = require('./pos-order.model');
const Product = require('../product/product.model');
const User = require('../user/user.model');
const loyaltyService = require('../user/loyalty.service');

/**
 * Create a new POS sale
 */
const createOrder = async (orderData) => {
    const session = await POSOrder.startSession();
    session.startTransaction();
    try {
        // 1. Create the order
        const order = await POSOrder.create([orderData], { session });

        // 2. Update product stock for each item
        for (const item of orderData.items) {
            await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: -item.quantity, sales: item.quantity } },
                { session }
            );
        }

        // 3. Award loyalty points if customer phone is provided
        if (orderData.customer?.phone) {
            const user = await User.findOne({ phone: orderData.customer.phone }).session(session);
            if (user) {
                await loyaltyService.awardPoints(user._id, orderData.grandTotal, session);
            }
        }

        await session.commitTransaction();
        return order[0];
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Get all orders for a store
 */
const getStoreOrders = async (shop_id, filter = {}) => {
    return await POSOrder.find({ shop_id, ...filter })
        .populate('billedBy', 'name')
        .sort({ createdAt: -1 });
};

/**
 * Get order by ID
 */
const getOrderById = async (id) => {
    return await POSOrder.findById(id).populate('billedBy', 'name');
};

/**
 * Get analytics for a store (Daily Sales)
 */
const getStoreAnalytics = async (shop_id, startDate, endDate) => {
    return await POSOrder.aggregate([
        {
            $match: {
                shop_id,
                createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
                status: 'completed'
            }
        },
        {
            $group: {
                _id: null,
                totalSales: { $sum: "$grandTotal" },
                orderCount: { $sum: 1 },
                totalGST: { $sum: "$totalGST" }
            }
        }
    ]);
};

module.exports = {
    createOrder,
    getStoreOrders,
    getOrderById,
    getStoreAnalytics
};
