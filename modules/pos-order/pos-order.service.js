const mongoose = require('mongoose');
const POSOrder = require('./pos-order.model');
const Product = require('../product/product.model');
const User = require('../user/user.model');
const Scheme = require('../scheme/scheme.model');
const loyaltyService = require('../user/loyalty.service');
const inventoryService = require('../product/inventory.service');
const auditService = require('../audit/audit.service');

const cashbookService = require('../accounting/cashbook.service');
const ledgerService = require('../accounting/customer-ledger.service');

const MAX_RETRIES = 3;

/**
 * Create a new POS sale with ERP Financial Integration & Concurrency Retries
 */
const createOrder = async (orderData) => {
    let retries = 0;
    while (retries < MAX_RETRIES) {
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

                // Update product status to 'sold'
                await Product.findByIdAndUpdate(item.product, { 
                    status: 'sold',
                    $inc: { sales: 1 }
                }, { session });
            }

            // 3. Process Payments & Accounting
            let totalCash = 0;
            let totalOnline = 0;
            let totalCredit = 0;
            let totalSchemeRedemption = 0;

            for (const payment of orderData.payments) {
                if (payment.method === 'cash') totalCash += payment.amount;
                else if (payment.method === 'upi' || payment.method === 'card' || payment.method === 'bank_transfer') totalOnline += payment.amount;
                else if (payment.method === 'credit') {
                    totalCredit += payment.amount;
                    orderObj.isCreditSale = true;
                    orderObj.creditAmount = totalCredit;
                }
                else if (payment.method === 'scheme_redemption') {
                    totalSchemeRedemption += payment.amount;
                }
            }

            // Handle Scheme Redemption (with SECURITY VALIDATION)
            if (totalSchemeRedemption > 0) {
                if (!orderData.redeemedSchemeId) throw new Error('Scheme ID is required for scheme redemption');
                if (!orderData.customerId) throw new Error('Customer ID is required to redeem a scheme');
                
                const scheme = await Scheme.findById(orderData.redeemedSchemeId).session(session);
                if (!scheme) throw new Error('Scheme not found');
                
                // Security Check: Verify scheme belongs to the customer making the purchase
                if (scheme.customer.toString() !== orderData.customerId.toString()) {
                    throw new Error('SECURITY ALERT: Unauthorized scheme redemption attempt. Scheme does not belong to this customer.');
                }
                
                if (scheme.status === 'redeemed' || scheme.status === 'closed') throw new Error('Scheme is already redeemed or closed');
                
                // Mark scheme as redeemed
                scheme.status = 'redeemed';
                scheme.redemptionOrder = orderObj._id;
                scheme.redemptionDate = new Date();
                scheme.redemptionValue = totalSchemeRedemption;
                await scheme.save({ session });
                
                orderObj.redeemedSchemeId = scheme._id;
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

            await orderObj.save({ session });
            await session.commitTransaction();
            return orderObj;
            
        } catch (error) {
            await session.abortTransaction();
            
            // If WriteConflict, retry up to MAX_RETRIES
            if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError') && retries < MAX_RETRIES - 1) {
                retries++;
                const delay = Math.pow(2, retries) * 100; // exponential backoff
                console.warn(`TransientTransactionError caught. Retrying transaction in ${delay}ms... (Attempt ${retries + 1}/${MAX_RETRIES})`);
                await new Promise(res => setTimeout(res, delay));
                continue;
            }
            throw error;
        } finally {
            session.endSession();
        }
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

/**
 * Process a return for an order
 */
const processReturn = async (orderId, returnData, performedBy) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const order = await POSOrder.findById(orderId).session(session);
        if (!order) throw new Error('Order not found');
        
        if (order.status === 'refunded') {
            throw new Error('Order is already fully refunded');
        }

        let refundTotal = 0;
        let returnedItemCount = 0;

        // Process returned items
        for (const returnItem of returnData.items) {
            const orderItem = order.items.find(i => i._id.toString() === returnItem.itemId);
            if (!orderItem) throw new Error(`Item ${returnItem.itemId} not found in order`);
            if (orderItem.returned) throw new Error(`Item ${orderItem.sku} is already returned`);

            // Mark as returned
            orderItem.returned = true;
            orderItem.returnReason = returnItem.reason || 'Customer Return';
            refundTotal += orderItem.totalAmount;
            returnedItemCount++;

            // Update Stock & Product Status
            await inventoryService.updateStock(orderItem.product, 1, {
                type: 'adjustment',
                action: 'RETURN',
                referenceId: order._id,
                performedBy: performedBy,
                notes: `Returned via POS Order #${order.orderId}`,
                session
            });

            await Product.findByIdAndUpdate(orderItem.product, { 
                status: 'qc_pending',
                $inc: { sales: -1 }
            }, { session });
        }

        // Add refund payment tracking
        if (returnData.refundMethod && refundTotal > 0) {
            order.refunds.push({
                method: returnData.refundMethod,
                amount: refundTotal,
                notes: 'Refund for returned items'
            });

            // Update Accounting
            if (returnData.refundMethod === 'cash') {
                await cashbookService.updateCashbookOnEvent(order.shop_id, refundTotal, 'cash', 'refund', session);
            } else if (returnData.refundMethod === 'upi') {
                await cashbookService.updateCashbookOnEvent(order.shop_id, refundTotal, 'upi', 'refund', session);
            } else if (returnData.refundMethod === 'credit') {
                if (!order.customerId) throw new Error('Customer ID is required for Store Credit refund');
                
                await cashbookService.updateCashbookOnEvent(order.shop_id, refundTotal, 'credit', 'refund', session);
                
                await ledgerService.recordTransaction({
                    customerId: order.customerId,
                    type: 'credit',
                    amount: refundTotal,
                    transactionType: 'refund',
                    referenceId: order._id,
                    referenceModel: 'POSOrder',
                    notes: `Store credit from returned Order ${order.orderId}`,
                    performedBy: performedBy
                }, session);
            }
        }

        // Check if fully or partially refunded
        const allItemsReturned = order.items.every(i => i.returned);
        order.status = allItemsReturned ? 'refunded' : 'partially_refunded';

        await order.save({ session });
        await session.commitTransaction();
        return order;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

module.exports = {
    createOrder,
    getStoreOrders,
    getOrderById,
    getStoreAnalytics,
    processReturn
};
