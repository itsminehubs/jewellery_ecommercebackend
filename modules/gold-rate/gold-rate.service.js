const GoldRate = require('./gold-rate.model');

/**
 * Update gold rate
 */
const updateRate = async (rateData) => {
    const rate = await GoldRate.create(rateData);
    
    // Trigger mass price recalculation in the background
    recalculateProductPrices(rateData.metal, rateData.purity).catch(err => {
        console.error("Error recalculating product prices after rate update:", err);
    });

    return rate;
};

/**
 * Recalculate prices for all active products matching the metal and purity
 */
const recalculateProductPrices = async (metal, purity) => {
    const Product = require('../product/product.model');
    
    // Find all products matching the metal and purity
    // metal in rateData is 'gold', 'silver', etc. 
    // In product it's stored in metalDetails.metalType (e.g., 'gold')
    const products = await Product.find({
        'metalDetails.metalType': new RegExp(`^${metal}$`, 'i'),
        'metalDetails.purity': purity
    });

    for (const product of products) {
        // Trigger pre-save hook which handles the dynamic price calculation
        product.markModified('metalDetails'); 
        await product.save();
    }
    console.log(`Recalculated prices for ${products.length} products with ${metal} ${purity}`);
};

/**
 * Get latest rate for a metal and purity
 */
const getLatestRate = async (metal, purity) => {
    return await GoldRate.findOne({ metal, purity })
        .sort({ effectiveDate: -1, createdAt: -1 });
};

/**
 * Get all current rates (latest for each metal/purity combo)
 */
const getCurrentRates = async () => {
    // Use aggregation to find the latest rate for each unique metal + purity combination
    return await GoldRate.aggregate([
        { $sort: { effectiveDate: -1, createdAt: -1 } },
        {
            $group: {
                _id: { metal: "$metal", purity: "$purity" },
                ratePerGram: { $first: "$ratePerGram" },
                effectiveDate: { $first: "$effectiveDate" },
                id: { $first: "$_id" }
            }
        },
        {
            $project: {
                _id: "$id",
                metal: "$_id.metal",
                purity: "$_id.purity",
                ratePerGram: 1,
                effectiveDate: 1
            }
        }
    ]);
};

/**
 * Delete all rates for a specific metal and purity
 */
const deleteRate = async (metal, purity) => {
    return await GoldRate.deleteMany({ metal, purity });
};

module.exports = {
    updateRate,
    getLatestRate,
    getCurrentRates,
    deleteRate,
};
