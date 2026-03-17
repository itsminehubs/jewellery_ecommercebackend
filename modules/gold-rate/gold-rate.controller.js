const goldRateService = require('./gold-rate.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const updateRate = asyncHandler(async (req, res) => {
    const rateData = {
        ...req.body,
        updatedBy: req.user._id
    };
    const rate = await goldRateService.updateRate(rateData);
    ApiResponse.created(rate, 'Gold rate updated successfully').send(res);
});

const getCurrentRates = asyncHandler(async (req, res) => {
    const rates = await goldRateService.getCurrentRates();
    ApiResponse.success(rates, 'Current gold rates fetched').send(res);
});

const getLatestRate = asyncHandler(async (req, res) => {
    const { metal, purity } = req.query;
    const rate = await goldRateService.getLatestRate(metal, purity);
    ApiResponse.success(rate, 'Latest gold rate fetched').send(res);
});

module.exports = {
    updateRate,
    getCurrentRates,
    getLatestRate,
};
