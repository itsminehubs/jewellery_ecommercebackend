const Order = require('../order/order.model');
const POSOrder = require('../pos-order/pos-order.model');
const Product = require('../product/product.model');
const AuditLog = require('../audit/audit.model');

/**
 * Calculate Gross Profit across a date range
 */
const calculateGrossProfit = async (startDate, endDate) => {
    const filter = {
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
        paymentStatus: 'completed' // For online orders
    };

    const posFilter = {
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
        status: 'completed' // For POS orders
    };

    // 1. Profit from Online Orders
    const onlineProfit = await Order.aggregate([
        { $match: filter },
        { $unwind: '$items' },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$items.price' },
                totalCOGS: { $sum: '$items.costPrice' },
                count: { $sum: 1 }
            }
        }
    ]);

    // 2. Profit from POS Orders
    const posProfit = await POSOrder.aggregate([
        { $match: posFilter },
        { $unwind: '$items' },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$items.totalAmount' },
                totalCOGS: { $sum: '$items.costPrice' },
                count: { $sum: 1 }
            }
        }
    ]);

    const onlineData = onlineProfit[0] || { totalRevenue: 0, totalCOGS: 0, count: 0 };
    const posData = posProfit[0] || { totalRevenue: 0, totalCOGS: 0, count: 0 };

    return {
        online: {
            revenue: onlineData.totalRevenue,
            cost: onlineData.totalCOGS,
            profit: onlineData.totalRevenue - onlineData.totalCOGS
        },
        pos: {
            revenue: posData.totalRevenue,
            cost: posData.totalCOGS,
            profit: posData.totalRevenue - posData.totalCOGS
        },
        unified: {
            totalRevenue: onlineData.totalRevenue + posData.totalRevenue,
            totalCost: onlineData.totalCOGS + posData.totalCOGS,
            totalProfit: (onlineData.totalRevenue - onlineData.totalCOGS) + (posData.totalRevenue - posData.totalCOGS)
        }
    };
};

/**
 * Calculate current Inventory Value
 */
const calculateInventoryValue = async () => {
    const stats = await Product.aggregate([
        {
            $group: {
                _id: null,
                totalStock: { $sum: '$stock' },
                inventoryValue: { $sum: { $multiply: ['$stock', '$purchasePrice'] } }
            }
        }
    ]);

    return {
        totalItems: stats[0]?.totalStock || 0,
        totalValue: stats[0]?.inventoryValue || 0
    };
};

module.exports = {
    calculateGrossProfit,
    calculateInventoryValue
};
