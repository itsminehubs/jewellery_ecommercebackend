const GoldRate = require('./gold-rate.model');

/**
 * Update gold rate
 */
const updateRate = async (rateData) => {
    return await GoldRate.create(rateData);
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
