const DiamondRate = require('./diamondRate.model');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

// @desc    Add a new diamond rate
// @route   POST /api/v1/diamond-rates
// @access  Private/Admin
const addRate = asyncHandler(async (req, res) => {
  const { cut, color, clarity, ratePerCarat, effectiveDate } = req.body;

  const rate = await DiamondRate.create({
    cut: cut || 'All',
    color: color || 'All',
    clarity: clarity || 'All',
    ratePerCarat,
    effectiveDate: effectiveDate || Date.now(),
    updatedBy: req.user?._id
  });

  ApiResponse.created(rate, 'Diamond rate added successfully').send(res);
});

// @desc    Get latest diamond rates
// @route   GET /api/v1/diamond-rates/latest
// @access  Public
const getLatestRates = asyncHandler(async (req, res) => {
  const { cut, color, clarity } = req.query;
  const query = {};
  if (cut) query.cut = cut;
  if (color) query.color = color;
  if (clarity) query.clarity = clarity;

  // We group by cut, color, clarity and get the latest for each if no specific query
  // For simplicity, let's just return the latest rates.
  const rates = await DiamondRate.find(query).sort({ effectiveDate: -1, createdAt: -1 }).limit(100);

  ApiResponse.success(rates, 'Latest diamond rates fetched successfully').send(res);
});

// @desc    Get history of diamond rates
// @route   GET /api/v1/diamond-rates/history
// @access  Private/Admin
const getRateHistory = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const rates = await DiamondRate.find()
    .populate('updatedBy', 'name email')
    .sort({ effectiveDate: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await DiamondRate.countDocuments();

  ApiResponse.success({ rates, total, page, pages: Math.ceil(total / limit) }, 'Diamond rate history fetched successfully').send(res);
});

// @desc    Update a diamond rate
// @route   PUT /api/v1/diamond-rates/:id
// @access  Private/Admin
const updateRate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cut, color, clarity, ratePerCarat, effectiveDate } = req.body;

  const rate = await DiamondRate.findById(id);
  if (!rate) {
    throw new ApiError(404, 'Diamond rate not found');
  }

  rate.cut = cut || rate.cut;
  rate.color = color || rate.color;
  rate.clarity = clarity || rate.clarity;
  if (ratePerCarat) rate.ratePerCarat = ratePerCarat;
  if (effectiveDate) rate.effectiveDate = effectiveDate;
  rate.updatedBy = req.user?._id;

  const updatedRate = await rate.save();
  ApiResponse.success(updatedRate, 'Diamond rate updated successfully').send(res);
});

// @desc    Delete a diamond rate
// @route   DELETE /api/v1/diamond-rates/:id
// @access  Private/Admin
const deleteRate = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const rate = await DiamondRate.findById(id);
  if (!rate) {
    throw new ApiError(404, 'Diamond rate not found');
  }

  await DiamondRate.findByIdAndDelete(id);
  ApiResponse.success({}, 'Diamond rate deleted successfully').send(res);
});

module.exports = {
  addRate,
  getLatestRates,
  getRateHistory,
  updateRate,
  deleteRate
};
