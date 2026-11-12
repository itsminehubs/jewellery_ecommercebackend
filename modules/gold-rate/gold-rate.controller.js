const goldRateService = require('./gold-rate.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const updateRate = asyncHandler(async (req, res) => {
    const rateData = {
        ...req.body,
        updatedBy: req.user.id
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

const deleteRate = asyncHandler(async (req, res) => {
    const { metal, purity } = req.params;
    await goldRateService.deleteRate(metal, purity);
    ApiResponse.success(null, 'Gold rate deleted successfully').send(res);
});

// Scheme Rate Controllers
const updateSchemeRate = asyncHandler(async (req, res) => {
    const rateData = {
        ...req.body,
        updatedBy: req.user.id
    };
    const rate = await goldRateService.updateSchemeRate(rateData);
    ApiResponse.created(rate, 'Scheme gold rate updated successfully').send(res);
});

const getSchemeCurrentRates = asyncHandler(async (req, res) => {
    const rates = await goldRateService.getSchemeCurrentRates();
    ApiResponse.success(rates, 'Current scheme gold rates fetched').send(res);
});

const deleteSchemeRate = asyncHandler(async (req, res) => {
    const { metal, purity } = req.params;
    await goldRateService.deleteSchemeRate(metal, purity);
    ApiResponse.success(null, 'Scheme gold rate deleted successfully').send(res);
});

module.exports = {
    updateRate,
    getCurrentRates,
    getLatestRate,
    deleteRate,
    updateSchemeRate,
    getSchemeCurrentRates,
    deleteSchemeRate
};
