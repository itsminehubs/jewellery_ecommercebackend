const goldRateService = require('./gold-rate.service');

const updateRate = async (req, res) => {
    try {
        const rateData = {
            ...req.body,
            updatedBy: req.user._id
        };
        const rate = await goldRateService.updateRate(rateData);
        res.status(201).json({ success: true, data: rate });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const getCurrentRates = async (req, res) => {
    try {
        const rates = await goldRateService.getCurrentRates();
        res.status(200).json({ success: true, data: rates });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getLatestRate = async (req, res) => {
    try {
        const { metal, purity } = req.query;
        const rate = await goldRateService.getLatestRate(metal, purity);
        res.status(200).json({ success: true, data: rate });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    updateRate,
    getCurrentRates,
    getLatestRate,
};
