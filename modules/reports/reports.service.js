const prisma = require('../../config/prisma');
const goldRateService = require('../gold-rate/gold-rate.service');

/**
 * GST & Sales Summary for a date range
 */
const getGSTSummary = async (shop_id, startDate, endDate) => {
    const where = {
        storeId: shop_id,
        status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED'] }
    };

    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const summary = await prisma.pOSOrder.aggregate({
        where,
        _sum: {
            grandTotal: true,
            subTotal: true,
            taxTotal: true
        },
        _count: { id: true }
    });

    if (summary._count.id === 0) {
        return { totalSales: 0, totalTaxableAmount: 0, totalGST: 0, cgst: 0, sgst: 0, igst: 0, orderCount: 0 };
    }

    const totalSales = summary._sum.grandTotal ? Number(summary._sum.grandTotal) : 0;
    const totalTaxableAmount = summary._sum.subTotal ? Number(summary._sum.subTotal) : 0;
    const totalGST = summary._sum.taxTotal ? Number(summary._sum.taxTotal) : 0;

    return {
        totalSales,
        totalTaxableAmount,
        totalGST,
        cgst: totalGST / 2, // 1.5%
        sgst: totalGST / 2, // 1.5%
        igst: 0,            // 3% (If inter-state)
        orderCount: summary._count.id
    };
};

/**
 * Stock Valuation (Dead Stock) based on live rates
 */
const getStockValuation = async (shop_id) => {
    // 1. Fetch active physical stock by metal and purity
    // In Prisma, we join Product with ProductMetal to group
    const products = await prisma.product.findMany({
        where: {
            shopId: shop_id,
            status: 'ACTIVE',
            stock: { gt: 0 }
            // Note: isPhysical field does not exist on Prisma schema currently, filtering by status ACTIVE
        },
        include: { metalDetails: true }
    });

    // Aggregate in memory
    const stockMap = {};
    for (const product of products) {
        if (product.metalDetails) {
            const key = `${product.metalDetails.metalType}_${product.metalDetails.purity}`;
            if (!stockMap[key]) {
                stockMap[key] = {
                    metalType: product.metalDetails.metalType,
                    purity: product.metalDetails.purity,
                    totalWeight: 0,
                    itemCount: 0
                };
            }
            // Product stock * metal net weight per product
            const qty = product.stock || 1;
            stockMap[key].totalWeight += Number(product.metalDetails.netWeight) * qty;
            stockMap[key].itemCount += qty;
        }
    }

    const stockAggregation = Object.values(stockMap);

    // 2. Fetch live rates
    let liveRates = [];
    try {
        liveRates = await goldRateService.getLatestRates(shop_id);
    } catch (e) {
        console.warn('Could not fetch live rates for valuation');
    }

    // 3. Map rates to stock
    let totalValuation = 0;
    const breakdown = stockAggregation.map(item => {
        const metal = item.metalType;
        const purity = item.purity;
        
        // Find matching rate
        const rateObj = liveRates.find(r => r.metal === metal && r.purity === purity);
        const currentRatePerGram = rateObj ? Number(rateObj.ratePerGram) : 0;
        
        const value = item.totalWeight * currentRatePerGram;
        totalValuation += value;

        return {
            metalType: metal,
            purity: purity,
            totalWeight: item.totalWeight,
            itemCount: item.itemCount,
            currentRatePerGram,
            valuation: value
        };
    });

    return {
        totalValuation,
        breakdown
    };
};

/**
 * Customer Dues (Udhar)
 */
const getCustomerDues = async (shop_id) => {
    // Return all customers with outstanding balance > 0
    // Prisma Decimal requires filtering like this
    const dues = await prisma.user.findMany({
        where: {
            outstandingBalance: { gt: 0 }
        },
        select: {
            name: true,
            phone: true,
            email: true,
            outstandingBalance: true,
            lastPaymentDate: true
        },
        orderBy: { outstandingBalance: 'desc' }
    });

    return dues;
};

module.exports = {
    getGSTSummary,
    getStockValuation,
    getCustomerDues
};
