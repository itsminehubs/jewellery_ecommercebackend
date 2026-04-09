const mongoose = require('mongoose');
const POSOrder = require('./pos-order.model');
const Product = require('../product/product.model');
const User = require('../user/user.model');
const loyaltyService = require('../user/loyalty.service');
const inventoryService = require('../product/inventory.service');
const auditService = require('../audit/audit.service');

const cashbookService = require('../accounting/cashbook.service');
const ledgerService = require('../accounting/customer-ledger.service');

/**
 * Create a new POS sale with ERP Financial Integration
 */
const createOrder = async (orderData) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        // 1. Create the order
        const order = await POSOrder.create([orderData], { session });
        const orderObj = order[0];

        // 2. Process Items (Unique Item Logic)
        for (const item of orderData.items) {
            // Centralized Stock Update & Audit Logging
            await inventoryService.updateStock(item.product, -1, {
                type: 'sale',
                action: 'ITEM_SOLD',
                referenceId: orderObj._id,
                performedBy: orderData.billedBy,
                notes: `Sold via POS Order #${orderObj.orderId}`,
                session
            });

            // Update product status to 'sold' (Unique piece logic - specific to Jewelry)
            await Product.findByIdAndUpdate(item.product, { 
                status: 'sold',
                $inc: { sales: 1 }
            }, { session });
        }

        // 3. Process Payments & Accounting
        let totalCash = 0;
        let totalOnline = 0;
        let totalCredit = 0;

        for (const payment of orderData.payments) {
            if (payment.method === 'cash') totalCash += payment.amount;
            else if (payment.method === 'upi' || payment.method === 'card' || payment.method === 'bank_transfer') totalOnline += payment.amount;
            else if (payment.method === 'credit') {
                totalCredit += payment.amount;
                orderObj.isCreditSale = true;
                orderObj.creditAmount = totalCredit;
            }
        }

        // 4. Update Daily Cashbook
        if (totalCash > 0) await cashbookService.updateCashbookOnEvent(orderData.shop_id, totalCash, 'cash', 'sale', session);
        if (totalOnline > 0) await cashbookService.updateCashbookOnEvent(orderData.shop_id, totalOnline, 'upi', 'sale', session);
        
        // 5. Handle Customer Credit (Udhar)
        if (totalCredit > 0) {
            if (!orderData.customerId) throw new Error('Customer ID is required for credit (Udhar) sales');
            
            await cashbookService.updateCashbookOnEvent(orderData.shop_id, totalCredit, 'credit', 'sale', session);
            
            await ledgerService.recordTransaction({
                customerId: orderData.customerId,
                type: 'debit',
                amount: totalCredit,
                transactionType: 'sale',
                referenceId: orderObj._id,
                referenceModel: 'POSOrder',
                notes: `Credit sale from Order ${orderObj.orderId}`,
                performedBy: orderData.billedBy
            }, session);
        }

        // 6. Award loyalty points if customer phone is provided
        if (orderData.customer?.phone) {
            const user = await User.findOne({ phone: orderData.customer.phone }).session(session);
            if (user) {
                await loyaltyService.awardPoints(user._id, orderData.grandTotal, session);
            }
        }

        await session.commitTransaction();
        return orderObj;
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
