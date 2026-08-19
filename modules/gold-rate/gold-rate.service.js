const prisma = require('../../config/prisma');

/**
 * Update gold rate
 */
const updateRate = async (rateData) => {
    const rate = await prisma.goldRate.create({
        data: {
            metal: rateData.metal || 'gold',
            purity: rateData.purity,
            ratePerGram: rateData.ratePerGram,
            effectiveDate: rateData.effectiveDate || new Date()
        }
    });
    
    // Trigger mass price recalculation in the background
    recalculateProductPrices(rate.metal, rate.purity).catch(err => {
        console.error("Error recalculating product prices after rate update:", err);
    });

    return rate;
};

/**
 * Recalculate prices for all active products matching the metal and purity
 */
const recalculateProductPrices = async (metal, purity) => {
    // In Prisma, we don't have pre-save hooks.
    // We will call the productService to handle the explicit calculation.
    const productService = require('../product/product.service');
    
    // For now, we will just call a method on productService
    // that handles finding the products and updating their finalPrice
    if (productService.recalculatePricesForMetal) {
        await productService.recalculatePricesForMetal(metal, purity);
    } else {
        console.warn("productService.recalculatePricesForMetal not implemented yet");
    }
};

/**
 * Get latest rate for a metal and purity
 */
const getLatestRate = async (metal, purity) => {
    return await prisma.goldRate.findFirst({
        where: { metal, purity },
        orderBy: [
            { effectiveDate: 'desc' },
            { createdAt: 'desc' }
        ]
    });
};

/**
 * Get all current rates (latest for each metal/purity combo)
 */
const getCurrentRates = async () => {
    // Prisma doesn't have a direct equivalent to Mongo's $group for complete records easily
    // So we fetch distinct metal/purity pairs, then fetch the latest for each
    const uniqueGroups = await prisma.goldRate.groupBy({
        by: ['metal', 'purity'],
    });

    const currentRates = await Promise.all(
        uniqueGroups.map(async (group) => {
            return await prisma.goldRate.findFirst({
                where: { metal: group.metal, purity: group.purity },
                orderBy: [
                    { effectiveDate: 'desc' },
                    { createdAt: 'desc' }
                ]
            });
        })
    );

    return currentRates.filter(r => r !== null);
};

/**
 * Delete all rates for a specific metal and purity
 */
const deleteRate = async (metal, purity) => {
    return await prisma.goldRate.deleteMany({
        where: { metal, purity }
    });
};

module.exports = {
    updateRate,
    getLatestRate,
    getCurrentRates,
    deleteRate,
};
