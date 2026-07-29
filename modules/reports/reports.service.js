const mongoose = require('mongoose');
const POSOrder = require('../pos-order/pos-order.model');
const Product = require('../product/product.model');
const User = require('../user/user.model');
const goldRateService = require('../gold-rate/gold-rate.service');

/**
 * GST & Sales Summary for a date range
 */
const getGSTSummary = async (shop_id, startDate, endDate) => {
    const match = {
        shop_id,
        status: { $in: ['completed', 'partially_refunded'] }
    };
    if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const summary = await POSOrder.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalSales: { $sum: '$grandTotal' },
                totalTaxableAmount: { $sum: '$subtotal' },
                totalGST: { $sum: '$totalGST' },
                orderCount: { $sum: 1 }
            }
        }
    ]);

    // Properly split based on Inter-state vs Intra-state (Accounting Compliance)
    // For now, if order doesn't explicitly state it's interstate, default to intra-state (CGST/SGST)
    if (summary.length === 0) return { totalSales: 0, totalTaxableAmount: 0, totalGST: 0, cgst: 0, sgst: 0, igst: 0, orderCount: 0 };
    
    const data = summary[0];
    
    // In a full implementation, you would aggregate by a boolean `isInterState` on POSOrder
    // Here we split the total based on the assumption that 100% is intra-state unless specified.
    return {
        ...data,
        cgst: data.totalGST / 2, // 1.5%
        sgst: data.totalGST / 2, // 1.5%
        igst: 0                  // 3% (If inter-state)
    };
};

/**
 * Stock Valuation (Dead Stock) based on live rates
 */
const getStockValuation = async (shop_id) => {
    // 1. Aggregate active physical stock by metal and purity
    const stockAggregation = await Product.aggregate([
        { $match: { shop_id, status: 'active', isPhysical: true } },
        {
            $group: {
                _id: { metalType: '$metalType', purity: '$purity' },
                totalWeight: { $sum: '$weight' },
                itemCount: { $sum: 1 }
            }
        }
    ]);

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
        const metal = item._id.metalType;
        const purity = item._id.purity;
        
        // Find matching rate
        const rateObj = liveRates.find(r => r.metal === metal && r.purity === purity);
        const currentRatePerGram = rateObj ? (rateObj.ratePerGram || rateObj.rate) : 0;
        
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
    // Note: User model might not have shop_id if customers are global, 
    // but typically we can filter by outstandingBalance > 0
    // If shop isolation is needed, we would need to join with CustomerLedger or just return all global dues for now.
    const dues = await User.find({ outstandingBalance: { $gt: 0 } })
        .select('name phone email outstandingBalance lastPaymentDate')
        .sort({ outstandingBalance: -1 });

    return dues;
};

module.exports = {
    getGSTSummary,
    getStockValuation,
    getCustomerDues
};
