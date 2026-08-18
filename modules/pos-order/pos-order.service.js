const prisma = require('../../config/prisma');
const loyaltyService = require('../user/loyalty.service');
const inventoryService = require('../product/inventory.service');
const cashbookService = require('../accounting/cashbook.service');
const ledgerService = require('../accounting/customer-ledger.service');
const { sendEmail } = require('../../jobs/email.job');
const { generatePOSBillEmail } = require('../../utils/emailTemplates');

const MAX_RETRIES = 3;

/**
 * Create a new POS sale with ERP Financial Integration
 */
const createOrder = async (orderData) => {
    // We use Prisma interactive transactions
    return await prisma.$transaction(async (tx) => {
        // 1. Generate Order Number
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await tx.pOSOrder.count({
            where: {
                storeId: orderData.shop_id,
                createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) }
            }
        }) + 1;
        const orderNumber = `POS-${orderData.shop_id}-${dateStr}-${count.toString().padStart(4, '0')}`;

        // Prepare totals
        let totalCash = 0;
        let totalOnline = 0;
        let totalCredit = 0;
        let totalSchemeRedemption = 0;
        let totalCreditMemo = 0;

        for (const payment of orderData.payments || []) {
            if (payment.method === 'cash') totalCash += payment.amount;
            else if (payment.method === 'upi' || payment.method === 'card' || payment.method === 'bank_transfer') totalOnline += payment.amount;
            else if (payment.method === 'credit') totalCredit += payment.amount;
            else if (payment.method === 'scheme_redemption') totalSchemeRedemption += payment.amount;
            else if (payment.method === 'credit_memo') totalCreditMemo += payment.amount;
        }

        // 2. Handle Scheme Redemption (with SECURITY VALIDATION)
        let redeemedSchemeId = null;
        if (totalSchemeRedemption > 0) {
            if (!orderData.redeemedSchemeId) throw new Error('Scheme ID is required for scheme redemption');
            if (!orderData.customerId) throw new Error('Customer ID is required to redeem a scheme');
            
            const scheme = await tx.scheme.findUnique({ where: { id: orderData.redeemedSchemeId } });
            if (!scheme) throw new Error('Scheme not found');
            
            // Security Check
            if (scheme.customerId !== orderData.customerId) {
                throw new Error('SECURITY ALERT: Unauthorized scheme redemption attempt. Scheme does not belong to this customer.');
            }
            
            if (scheme.status === 'redeemed' || scheme.status === 'closed') throw new Error('Scheme is already redeemed or closed');
            
            // Update scheme status (we will link order ID after order creation)
            await tx.scheme.update({
                where: { id: scheme.id },
                data: {
                    status: 'redeemed',
                    redemptionDate: new Date(),
                    redemptionValue: totalSchemeRedemption
                }
            });
            redeemedSchemeId = scheme.id;
        }

        // 3. Handle Credit Memo Redemption
        if (totalCreditMemo > 0) {
            for (const payment of orderData.payments) {
                if (payment.method === 'credit_memo') {
                    if (!payment.referenceId) throw new Error('Reference ID (Credit Memo ID) is required for credit_memo payment');
                    
                    const memo = await tx.creditMemo.findFirst({
                        where: {
                            memoId: payment.referenceId,
                            balance: { gte: payment.amount }
                        }
                    });
                    
                    if (!memo) throw new Error(`Credit Memo ${payment.referenceId} not found or insufficient balance.`);

                    const newBalance = Number(memo.balance) - payment.amount;
                    await tx.creditMemo.update({
                        where: { id: memo.id },
                        data: {
                            balance: newBalance,
                            status: newBalance <= 0 ? 'DEPLETED' : 'ACTIVE',
                            // For a robust system we'd track redemptions in a separate table, but updating balance is key
                        }
                    });
                }
            }
        }

        // 4. Create the order
        const order = await tx.pOSOrder.create({
            data: {
                orderNumber,
                storeId: orderData.shop_id,
                customerId: orderData.customerId || null,
                staffId: orderData.billedBy,
                subTotal: orderData.subTotal || 0,
                taxTotal: orderData.totalGST || 0,
                discountTotal: orderData.discount || 0,
                grandTotal: orderData.grandTotal || 0,
                cashPaid: totalCash,
                cardPaid: totalOnline, // Simplification
                upiPaid: 0,
                creditUsed: totalCredit,
                status: 'COMPLETED',
                notes: orderData.notes,
                items: {
                    create: orderData.items.map(item => ({
                        productId: item.product,
                        quantity: 1, // Usually 1 for jewelry
                        unitPrice: item.price || 0,
                        discount: item.discount || 0,
                        taxAmount: item.taxAmount || 0,
                        totalPrice: item.totalAmount || 0
                    }))
                }
            },
            include: { items: true }
        });

        // Link Scheme Redemption to Order
        if (redeemedSchemeId) {
            await tx.scheme.update({
                where: { id: redeemedSchemeId },
                data: { redemptionOrderId: order.id }
            });
        }

        // 5. Process Items
        for (const item of order.items) {
            // Centralized Stock Update & Audit Logging
            await inventoryService.updateStock(item.productId, -item.quantity, {
                type: 'sale',
                action: 'ITEM_SOLD',
                referenceId: order.id,
                performedBy: orderData.billedBy,
                notes: `Sold via POS Order #${order.orderNumber}`,
                tx
            });

            // Update product status to 'sold'
            await tx.product.update({
                where: { id: item.productId },
                data: {
                    status: 'sold',
                    // Note: sales field not explicitly defined in Prisma, skipping it if not present
                }
            });
        }

        // 6. Update Daily Cashbook
        if (totalCash > 0 && cashbookService.updateCashbookOnEventPrisma) {
            await cashbookService.updateCashbookOnEventPrisma(orderData.shop_id, totalCash, 'cash', 'sale', tx);
        }
        if (totalOnline > 0 && cashbookService.updateCashbookOnEventPrisma) {
            await cashbookService.updateCashbookOnEventPrisma(orderData.shop_id, totalOnline, 'upi', 'sale', tx);
        }
        
        // 7. Handle Customer Credit (Udhar)
        if (totalCredit > 0) {
            if (!orderData.customerId) throw new Error('Customer ID is required for credit (Udhar) sales');
            
            if (cashbookService.updateCashbookOnEventPrisma) {
                await cashbookService.updateCashbookOnEventPrisma(orderData.shop_id, totalCredit, 'credit', 'sale', tx);
            }
            
            if (ledgerService.recordTransactionPrisma) {
                await ledgerService.recordTransactionPrisma({
                    customerId: orderData.customerId,
                    type: 'debit',
                    amount: totalCredit,
                    transactionType: 'sale',
                    referenceId: order.id,
                    referenceModel: 'POSOrder',
                    notes: `Credit sale from Order ${order.orderNumber}`,
                    performedBy: orderData.billedBy
                }, tx);
            }
        }

        // 8. Award loyalty points & send Email
        if (orderData.customerId) {
            const user = await tx.user.findUnique({ where: { id: orderData.customerId } });
            if (user) {
                // Not in same tx if using external mongoose service, but assuming it uses Prisma now
                if (loyaltyService.awardPointsPrisma) {
                    await loyaltyService.awardPointsPrisma(user.id, orderData.grandTotal, tx);
                }
                
                // Dispatch Email
                if (user.email) {
                    try {
                        const emailContent = generatePOSBillEmail(order, user.name || 'Valued Customer');
                        await sendEmail({
                            to: user.email,
                            emailType: 'customer',
                            subject: emailContent.subject,
                            text: emailContent.text,
                            html: emailContent.html
                        });
                    } catch (err) {
                        console.error(`Failed to queue POS email for ${user.email}: ${err.message}`);
                    }
                }
            }
        }

        return order;
    });
};

const getStoreOrders = async (shop_id, query = {}) => {
    const { page = 1, limit = 20, search = '' } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { storeId: shop_id };
    
    if (search) {
        where.OR = [
            { orderNumber: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { customer: { phone: { contains: search, mode: 'insensitive' } } }
        ];
    }

    const items = await prisma.pOSOrder.findMany({
        where,
        include: { staff: { select: { name: true } }, customer: { select: { name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
    });

    const total = await prisma.pOSOrder.count({ where });

    return {
        items,
        pagination: {
            totalItems: total,
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit))
        }
    };
};

const getOrderById = async (id) => {
    return await prisma.pOSOrder.findUnique({
        where: { id },
        include: { staff: { select: { name: true } }, customer: true, items: true }
    });
};

const getStoreAnalytics = async (shop_id, startDate, endDate) => {
    const stats = await prisma.pOSOrder.aggregate({
        where: {
            storeId: shop_id,
            createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
            status: 'COMPLETED'
        },
        _sum: {
            grandTotal: true,
            taxTotal: true
        },
        _count: {
            id: true
        }
    });

    return [{
        totalSales: stats._sum.grandTotal || 0,
        orderCount: stats._count.id || 0,
        totalGST: stats._sum.taxTotal || 0
    }];
};

const processReturn = async (orderId, returnData, performedBy) => {
    return await prisma.$transaction(async (tx) => {
        const order = await tx.pOSOrder.findUnique({
            where: { id: orderId },
            include: { items: true }
        });
        
        if (!order) throw new Error('Order not found');
        if (order.status === 'REFUNDED') throw new Error('Order is already fully refunded');

        let refundTotal = 0;

        for (const returnItem of returnData.items) {
            const orderItem = order.items.find(i => i.id === returnItem.itemId);
            if (!orderItem) throw new Error(`Item ${returnItem.itemId} not found in order`);

            // Check if already returned using notes or additional fields if added to schema
            // For now assume we process valid items
            refundTotal += Number(orderItem.totalPrice);

            // Update Stock
            await inventoryService.updateStock(orderItem.productId, orderItem.quantity, {
                type: 'adjustment',
                action: 'RETURN',
                referenceId: order.id,
                performedBy: performedBy,
                notes: `Returned via POS Order #${order.orderNumber}. Reason: ${returnItem.reason}`,
                tx
            });

            await tx.product.update({
                where: { id: orderItem.productId },
                data: { status: 'qc_pending' }
            });
        }

        // Add refund payment tracking (if schema supports it, we skip for now or use notes)
        const updatedNotes = (order.notes || '') + ` | Refunded ${refundTotal} via ${returnData.refundMethod}`;

        // Accounting
        if (returnData.refundMethod === 'cash' && cashbookService.updateCashbookOnEventPrisma) {
            await cashbookService.updateCashbookOnEventPrisma(order.storeId, refundTotal, 'cash', 'refund', tx);
        } else if (returnData.refundMethod === 'credit') {
            if (!order.customerId) throw new Error('Customer ID is required for Store Credit refund');
            
            if (cashbookService.updateCashbookOnEventPrisma) {
                await cashbookService.updateCashbookOnEventPrisma(order.storeId, refundTotal, 'credit', 'refund', tx);
            }
            
            if (ledgerService.recordTransactionPrisma) {
                await ledgerService.recordTransactionPrisma({
                    customerId: order.customerId,
                    type: 'credit',
                    amount: refundTotal,
                    transactionType: 'refund',
                    referenceId: order.id,
                    referenceModel: 'POSOrder',
                    notes: `Store credit from returned Order ${order.orderNumber}`,
                    performedBy: performedBy
                }, tx);
            }
        }

        const updatedOrder = await tx.pOSOrder.update({
            where: { id: order.id },
            data: {
                status: 'PARTIALLY_REFUNDED', // Simplified
                notes: updatedNotes
            }
        });

        return updatedOrder;
    });
};

module.exports = {
    createOrder,
    getStoreOrders,
    getOrderById,
    getStoreAnalytics,
    processReturn
};
