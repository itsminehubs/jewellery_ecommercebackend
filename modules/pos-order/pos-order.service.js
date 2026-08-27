const prisma = require('../../config/prisma');
const loyaltyService = require('../user/loyalty.service');
const inventoryService = require('../product/inventory.service');
const cashbookService = require('../accounting/cashbook.service');
const ledgerService = require('../accounting/customer-ledger.service');
const { sendEmail } = require('../../jobs/email.job');
const { generatePOSBillEmail } = require('../../utils/emailTemplates');
const pricingService = require('../product/pricing.service');

const MAX_RETRIES = 3;

const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
const roundTo3 = (num) => Math.round((num + Number.EPSILON) * 1000) / 1000;

/**
 * Calculate the exact price of a POS cart based on live rates
 */
const calculateCartPrice = async (items, storeId) => {
    let cartSubtotal = 0;
    let cartGst = 0;
    let cartTotal = 0;
    const calculatedItems = [];

    for (const item of items) {
        // Fetch full product from DB
        const productData = await prisma.product.findFirst({
            where: {
                OR: [
                    { sku: item.sku },
                    { huid: item.sku }
                ]
            },
            include: { metalDetails: true, stoneDetails: true }
        });

        if (!productData) {
            throw require('../../utils/ApiError').notFound(`Product not found for SKU: ${item.sku}`);
        }

        const metalDetails = productData.metalDetails;
        const stoneDetails = productData.stoneDetails;
        const grossWeight = metalDetails?.grossWeight ? Number(metalDetails.grossWeight) : 0;
        let totalStoneWeight = 0;
        let dynamicStoneValue = 0;

        // 1. Calculate Stone Weight and Value
        if (stoneDetails && stoneDetails.length > 0) {
            for (let stone of stoneDetails) {
                let caratVal = stone.carat ? parseFloat(stone.carat) : 0;
                if (caratVal > 0) {
                    stone.netWeight = roundTo3(caratVal * 0.200);
                }
                const stoneWeightGrams = stone.netWeight ? Number(stone.netWeight) : 0;
                totalStoneWeight += stoneWeightGrams;

                let rate = stone.rate ? Number(stone.rate) : 0;
                if (stone.stoneType === 'Diamond') {
                    const query = {
                        cut: stone.cut || 'All',
                        color: stone.color || 'All',
                        clarity: stone.clarity || 'All'
                    };
                    let diamondRateDoc = await prisma.diamondRate.findFirst({
                        where: query,
                        orderBy: { effectiveDate: 'desc' }
                    });
                    if (!diamondRateDoc) {
                        diamondRateDoc = await prisma.diamondRate.findFirst({
                            where: { cut: 'All', color: 'All', clarity: 'All' },
                            orderBy: { effectiveDate: 'desc' }
                        });
                    }
                    if (diamondRateDoc) {
                        rate = Number(diamondRateDoc.ratePerCarat);
                    }
                    const calculationCarat = caratVal > 0 ? caratVal : (stoneWeightGrams / 0.200);
                    dynamicStoneValue += calculationCarat * rate;
                } else {
                    if (caratVal > 0) {
                        dynamicStoneValue += caratVal * rate;
                    } else {
                        dynamicStoneValue += stoneWeightGrams * rate;
                    }
                }
            }
        }

        const manualStoneCharges = productData.stoneCharges ? Number(productData.stoneCharges) : 0;
        const stoneValue = roundTo2(dynamicStoneValue > 0 ? dynamicStoneValue : manualStoneCharges);

        // 2. Net Gold Weight
        const netWeight = roundTo3(Math.max(0, grossWeight - totalStoneWeight));

        let metalValue = 0;
        let rateUsed = 0;
        // 3. Fetch latest metal rate
        if (metalDetails && metalDetails.metalType && metalDetails.purity) {
            const latestRate = await prisma.goldRate.findFirst({
                where: {
                    metal: metalDetails.metalType.toLowerCase(),
                    purity: {
                        equals: metalDetails.purity,
                        mode: 'insensitive'
                    }
                },
                orderBy: { effectiveDate: 'desc' }
            });

            if (latestRate) {
                const ratePerGram = Number(latestRate.ratePerGram);
                rateUsed = ratePerGram;
                const wastagePercent = productData.wastage ? Number(productData.wastage) : 0;
                const wastageWeight = netWeight * (wastagePercent / 100);
                const finalGoldWeight = netWeight + wastageWeight;
                metalValue = roundTo2(finalGoldWeight * ratePerGram);
            }
        }

        // 5. Calculate Making Charges & Apply Discount
        let makingValue = 0;
        const makingCharges = productData.makingCharges ? Number(productData.makingCharges) : 0;
        if (productData.makingChargeType === 'per_gram') {
            makingValue = makingCharges * netWeight;
        } else {
            makingValue = makingCharges;
        }

        const discountAmount = Number(item.discount || 0);
        let discountedMakingValue = makingValue;
        if (discountAmount > 0) {
            discountedMakingValue = Math.max(0, makingValue - discountAmount);
        }
        discountedMakingValue = roundTo2(discountedMakingValue);

        // 6. Subtotal
        const subtotal = roundTo2(metalValue + discountedMakingValue + stoneValue);

        // 7. GST (Flat 3% on Subtotal)
        const gstRate = Number(productData.gstRate || 3);
        const gst = roundTo2(subtotal * (gstRate / 100));

        // 8. Totals
        const finalTotal = Math.round(subtotal + gst);

        cartSubtotal += subtotal;
        cartGst += gst;
        cartTotal += finalTotal;

        calculatedItems.push({
            ...productData,
            calculatedPrice: {
                metalValue,
                makingCharge: discountedMakingValue,
                originalMakingCharge: makingValue,
                stoneValue,
                discountAmount,
                subtotal,
                gst,
                finalTotal,
                rateUsed
            },
            quantity: item.quantity || 1
        });
    }

    return {
        items: calculatedItems,
        summary: {
            subtotal: roundTo2(cartSubtotal),
            gst: roundTo2(cartGst),
            total: Math.round(cartTotal)
        }
    };
};


/**
 * Create a new POS sale with ERP Financial Integration
 */
const createOrder = async (orderData) => {
    // We use Prisma interactive transactions
    return await prisma.$transaction(async (tx) => {
        // Resolve store UUID from shop_id
        const store = await tx.store.findUnique({ where: { shop_id: orderData.shop_id } });
        if (!store) throw new Error(`Store not found for shop_id: ${orderData.shop_id}`);
        const storeId = store.id;

        // 1. Generate Order Number
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        const dateStr = `${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${new Date().getDate().toString().padStart(2, '0')}`;
        const count = await tx.pOSOrder.count({
            where: {
                createdAt: { gte: startOfDay, lte: endOfDay }
            }
        }) + 1;
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const orderNumber = `CS-${dateStr}-${count.toString().padStart(4, '0')}-${randomSuffix}`;

        // Validate PAN for large transactions
        if (orderData.grandTotal > 200000 && !orderData.customerPan) {
            throw new Error('PAN is mandatory for transactions above ₹2,00,000');
        }
        if (orderData.customerPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(orderData.customerPan)) {
            throw new Error('Invalid PAN card format. It should be like ABCDE1234F');
        }

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
                            status: newBalance <= 0 ? 'depleted' : 'active',
                            // For a robust system we'd track redemptions in a separate table, but updating balance is key
                        }
                    });
                }
            }
        }

        const order = await tx.pOSOrder.create({
            data: {
                orderNumber,
                storeId: storeId,
                customerId: orderData.customerId || null,
                staffId: orderData.billedBy,
                customerPan: orderData.customerPan || null,
                customerGst: orderData.customerGst || null,
                subTotal: orderData.subTotal || orderData.subtotal || 0,
                taxTotal: orderData.totalGST || orderData.taxTotal || 0,
                discountTotal: orderData.discount || orderData.discountTotal || 0,
                grandTotal: orderData.grandTotal || ((orderData.subTotal || orderData.subtotal || 0) + (orderData.totalGST || orderData.taxTotal || 0) - (orderData.discount || orderData.discountTotal || 0) + (orderData.roundOff || 0)) || 0,
                cashPaid: totalCash,
                cardPaid: totalOnline, // Simplification
                upiPaid: 0,
                creditUsed: totalCredit,
                status: 'completed',
                notes: orderData.notes,
                items: {
                    create: orderData.items.map(item => ({
                        productId: item.product,
                        quantity: 1, // Usually 1 for jewelry
                        unitPrice: item.price || 0,
                        metalRate: item.goldRateAtTime || item.metalRate || orderData.metalRate || orderData.currentRate || 0,
                        discount: item.discount || 0,
                        taxAmount: item.taxAmount || 0,
                        totalPrice: item.totalAmount || 0
                    }))
                }
            },
            include: { items: { include: { product: true } } }
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
            await cashbookService.updateCashbookOnEventPrisma(storeId, totalCash, 'cash', 'sale', tx);
        }
        if (totalOnline > 0 && cashbookService.updateCashbookOnEventPrisma) {
            await cashbookService.updateCashbookOnEventPrisma(storeId, totalOnline, 'upi', 'sale', tx);
        }

        // 7. Handle Customer Credit (Udhar)
        if (totalCredit > 0) {
            if (!orderData.customerId) throw new Error('Customer ID is required for credit (Udhar) sales');

            if (cashbookService.updateCashbookOnEventPrisma) {
                await cashbookService.updateCashbookOnEventPrisma(storeId, totalCredit, 'credit', 'sale', tx);
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
    }, { maxWait: 10000, timeout: 30000 });
};

const getStoreOrders = async (shop_id, query = {}) => {
    const { page = 1, limit = 20, search = '', startDate, endDate } = query;
    const skip = (Number(page) - 1) * Number(limit);

    // Resolve store UUID
    let storeId = shop_id;
    const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(shop_id);
    if (!isUUID) {
        const store = await prisma.store.findUnique({ where: { shop_id } });
        if (store) storeId = store.id;
    }

    const where = { storeId: storeId };

    if (startDate && endDate) {
        where.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
    }

    if (search) {
        where.OR = [
            { orderNumber: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { customer: { phone: { contains: search, mode: 'insensitive' } } }
        ];
    }

    const items = await prisma.pOSOrder.findMany({
        where,
        include: {
            staff: { select: { name: true } },
            customer: { select: { id: true, name: true, phone: true, email: true, addresses: true } },
            items: { include: { product: { include: { metalDetails: true, stoneDetails: true } } } }
        },
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
        include: {
            staff: { select: { name: true } },
            customer: true,
            items: { include: { product: { include: { metalDetails: true, stoneDetails: true } } } }
        }
    });
};

const getStoreAnalytics = async (shop_id, startDate, endDate, includeOnline = false) => {
    // Resolve store UUID
    let storeId = undefined;
    if (shop_id) {
        storeId = shop_id;
        const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(shop_id);
        if (!isUUID) {
            const store = await prisma.store.findUnique({ where: { shop_id } });
            if (store) storeId = store.id;
        }
    }

    const stats = await prisma.pOSOrder.aggregate({
        where: {
            ...(storeId ? { storeId: storeId } : {}),
            createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
            status: 'completed'
        },
        _sum: {
            grandTotal: true,
            taxTotal: true
        },
        _count: {
            id: true
        }
    });

    const imitationStats = await prisma.imitationSale.aggregate({
        where: {
            createdAt: { gte: new Date(startDate), lte: new Date(endDate) }
        },
        _sum: { grandTotal: true },
        _count: { id: true }
    });

    const creditMemoStats = await prisma.creditMemo.aggregate({
        where: {
            createdAt: { gte: new Date(startDate), lte: new Date(endDate) }
        },
        _sum: { originalAmount: true },
        _count: { id: true }
    });

    // Dynamic Chart Grouping Logic
    const diffTime = Math.abs(new Date(endDate) - new Date(startDate));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const posOrdersRaw = await prisma.pOSOrder.findMany({
        where: { ...(storeId ? { storeId: storeId } : {}), createdAt: { gte: new Date(startDate), lte: new Date(endDate) }, status: 'completed' },
        select: { createdAt: true, grandTotal: true, customerId: true },
        orderBy: { createdAt: 'asc' }
    });

    const uniqueCustomerIds = new Set();
    posOrdersRaw.forEach(order => {
        if (order.customerId) {
            uniqueCustomerIds.add(order.customerId);
        }
    });
    const totalCustomers = uniqueCustomerIds.size;

    
    const imitationSalesRaw = await prisma.imitationSale.findMany({
        where: { createdAt: { gte: new Date(startDate), lte: new Date(endDate) } },
        select: { createdAt: true, grandTotal: true },
        orderBy: { createdAt: 'asc' }
    });
    
    const creditMemosRaw = await prisma.creditMemo.findMany({
        where: { createdAt: { gte: new Date(startDate), lte: new Date(endDate) } },
        select: { createdAt: true, originalAmount: true },
        orderBy: { createdAt: 'asc' }
    });

    const onlineOrdersRaw = includeOnline ? await prisma.order.findMany({
        where: { createdAt: { gte: new Date(startDate), lte: new Date(endDate) }, paymentStatus: 'completed' },
        select: { createdAt: true, grandTotal: true },
        orderBy: { createdAt: 'asc' }
    }) : [];

    const groupMultiData = (posData, onlineData) => {
        const map = new Map();
        
        const processData = (data, key) => {
            data.forEach(item => {
                const date = new Date(item.createdAt);
                let label = '';
                if (diffDays <= 1) {
                    const hr = date.getHours();
                    label = `${hr % 12 || 12}${hr < 12 ? 'am' : 'pm'}`;
                } else if (diffDays <= 7) {
                    label = date.toLocaleDateString('en-US', { weekday: 'short' });
                } else if (diffDays <= 31) {
                    label = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                } else {
                    label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                }
                
                if (!map.has(label)) {
                    map.set(label, { name: label, sales: 0, onlineSales: 0 });
                }
                map.get(label)[key] += Number(item.grandTotal || 0);
            });
        };
        
        processData(posData, 'sales');
        if (onlineData) {
            processData(onlineData, 'onlineSales');
        }
        
        const arr = Array.from(map.values());
        return arr.length > 0 ? arr : [{ name: 'No Data', sales: 0, onlineSales: 0 }];
    };

    const groupData = (data, valueKey) => {
        const map = new Map(); // using Map to preserve insertion order
        data.forEach(item => {
            const date = new Date(item.createdAt);
            let label = '';
            
            if (diffDays <= 1) {
                const hr = date.getHours();
                label = `${hr % 12 || 12}${hr < 12 ? 'am' : 'pm'}`;
            } else if (diffDays <= 7) {
                label = date.toLocaleDateString('en-US', { weekday: 'short' });
            } else if (diffDays <= 31) {
                label = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
            } else {
                label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            }
            
            map.set(label, (map.get(label) || 0) + Number(item[valueKey] || 0));
        });
        
        const arr = Array.from(map, ([name, sales]) => ({ name, sales }));
        return arr.length > 0 ? arr : [{ name: 'No Data', sales: 0 }];
    };

    const charts = {
        gold: groupMultiData(posOrdersRaw, onlineOrdersRaw),
        imitation: groupData(imitationSalesRaw, 'grandTotal'),
        credit: groupData(creditMemosRaw, 'originalAmount')
    };

    return [{
        totalSales: stats._sum.grandTotal || 0,
        orderCount: stats._count.id || 0,
        totalGST: stats._sum.taxTotal || 0,
        imitationSalesTotal: imitationStats._sum.grandTotal || 0,
        imitationCount: imitationStats._count.id || 0,
        creditMemoTotal: creditMemoStats._sum.originalAmount || 0,
        creditMemoCount: creditMemoStats._count.id || 0,
        totalCustomers: totalCustomers || 0,
        charts
    }];
};

const processReturn = async (orderId, returnData, performedBy) => {
    return await prisma.$transaction(async (tx) => {
        const order = await tx.pOSOrder.findUnique({
            where: { id: orderId },
            include: { items: { include: { product: true } } }
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
    }, { maxWait: 10000, timeout: 30000 });
};

const updateOrder = async (orderId, orderData) => {
    return await prisma.$transaction(async (tx) => {
        const existingOrder = await tx.pOSOrder.findUnique({
            where: { id: orderId },
            include: { items: true }
        });
        if (!existingOrder) throw new Error('Order not found');

        // Restore old stock
        for (const item of existingOrder.items) {
            await inventoryService.updateStock(item.productId, item.quantity, {
                type: 'adjustment',
                action: 'POS_ORDER_EDIT',
                referenceId: existingOrder.id,
                performedBy: orderData.billedBy,
                notes: 'Restored stock for POS order edit',
                tx
            });
            await tx.product.update({
                where: { id: item.productId },
                data: { status: 'available' }
            });
        }

        // Delete old items
        await tx.pOSOrderItem.deleteMany({ where: { posOrderId: orderId } });

        // Calculate new payments
        let totalCash = 0;
        let totalOnline = 0;
        let totalCredit = 0;

        for (const payment of orderData.payments || []) {
            if (payment.method === 'cash') totalCash += payment.amount;
            else if (['card', 'upi', 'online', 'bank_transfer'].includes(payment.method)) totalOnline += payment.amount;
            else if (payment.method === 'credit' || payment.method === 'udhar') totalCredit += payment.amount;
        }

        // Update the order details
        const updatedOrder = await tx.pOSOrder.update({
            where: { id: orderId },
            data: {
                customerId: orderData.customerId || null,
                staffId: orderData.billedBy,
                subTotal: orderData.subTotal || 0,
                taxTotal: orderData.totalGST || 0,
                discountTotal: orderData.discount || 0,
                grandTotal: orderData.grandTotal || 0,
                cashPaid: totalCash,
                cardPaid: totalOnline,
                upiPaid: 0,
                creditUsed: totalCredit,
                notes: orderData.notes,
                items: {
                    create: orderData.items.map(item => ({
                        productId: item.product || item.productId || item.id, // accommodate payload formats
                        quantity: 1,
                        unitPrice: item.price || item.unitPrice || 0,
                        metalRate: item.goldRateAtTime || item.metalRate || orderData.metalRate || orderData.currentRate || 0,
                        discount: item.discount || 0,
                        taxAmount: item.taxAmount || 0,
                        totalPrice: item.totalAmount || item.totalPrice || 0
                    }))
                }
            },
            include: { items: true }
        });

        // Deduct new stock
        for (const item of updatedOrder.items) {
            await inventoryService.updateStock(item.productId, -item.quantity, {
                type: 'sale',
                action: 'POS_ORDER_EDIT',
                referenceId: updatedOrder.id,
                performedBy: orderData.billedBy,
                notes: 'Sold via Edited POS Order',
                tx
            });
            await tx.product.update({
                where: { id: item.productId },
                data: { status: 'sold' }
            });
        }

        // Reconcile Ledgers / Cashbook
        const cashDiff = totalCash - Number(existingOrder.cashPaid);
        if (cashDiff !== 0 && cashbookService.updateCashbookOnEventPrisma) {
            await cashbookService.updateCashbookOnEventPrisma(existingOrder.storeId, cashDiff, 'cash', cashDiff > 0 ? 'sale' : 'refund', tx);
        }

        const onlineDiff = totalOnline - Number(existingOrder.cardPaid);
        if (onlineDiff !== 0 && cashbookService.updateCashbookOnEventPrisma) {
            await cashbookService.updateCashbookOnEventPrisma(existingOrder.storeId, onlineDiff, 'upi', onlineDiff > 0 ? 'sale' : 'refund', tx);
        }

        const creditDiff = totalCredit - Number(existingOrder.creditUsed);
        if (creditDiff !== 0) {
            if (!orderData.customerId && creditDiff > 0) throw new Error('Customer ID required for credit sales');
            if (cashbookService.updateCashbookOnEventPrisma) {
                await cashbookService.updateCashbookOnEventPrisma(existingOrder.storeId, creditDiff, 'credit', creditDiff > 0 ? 'sale' : 'refund', tx);
            }
            if (ledgerService.recordTransactionPrisma && orderData.customerId) {
                await ledgerService.recordTransactionPrisma({
                    customerId: orderData.customerId,
                    type: creditDiff > 0 ? 'debit' : 'credit',
                    amount: Math.abs(creditDiff),
                    transactionType: 'sale',
                    referenceId: updatedOrder.id,
                    referenceModel: 'POSOrder',
                    notes: 'Credit adjustment for POS Order Edit',
                    performedBy: orderData.billedBy
                }, tx);
            }
        }

        return await getOrderById(existingOrder.id);
    }, { maxWait: 10000, timeout: 30000 });
};

module.exports = {
    createOrder,
    updateOrder,
    getStoreOrders,
    getOrderById,
    getStoreAnalytics,
    processReturn,
    calculateCartPrice
};
