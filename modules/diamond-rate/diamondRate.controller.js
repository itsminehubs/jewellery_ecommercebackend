const prisma = require('../../config/prisma');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { asyncHandler } = require('../../middlewares/error.middleware');

// @desc    Add a new diamond rate
// @route   POST /api/v1/diamond-rates
// @access  Private/Admin
const addRate = asyncHandler(async (req, res) => {
  const { cut, color, clarity, ratePerCarat, effectiveDate } = req.body;

  const rate = await prisma.diamondRate.create({
    data: {
      cut: cut || 'All',
      color: color || 'All',
      clarity: clarity || 'All',
      ratePerCarat,
      effectiveDate: effectiveDate || new Date(),
      updatedById: req.user?.id
    }
  });

  // Background recalculation 
  recalculateDiamondProducts(rate).catch(err => {
    console.error("Error recalculating diamond products after rate update:", err);
  });

  ApiResponse.created(rate, 'Diamond rate added successfully').send(res);
});

// @desc    Get latest diamond rates
// @route   GET /api/v1/diamond-rates/latest
// @access  Public
const getLatestRates = asyncHandler(async (req, res) => {
  const { cut, color, clarity, page, limit } = req.query;
  const where = {};
  if (cut) where.cut = cut;
  if (color) where.color = color;
  if (clarity) where.clarity = clarity;

  if (page && limit) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const [rates, total] = await Promise.all([
      prisma.diamondRate.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [
          { effectiveDate: 'desc' },
          { createdAt: 'desc' }
        ]
      }),
      prisma.diamondRate.count({ where })
    ]);
    return ApiResponse.paginated(rates, pageNum, limitNum, total, 'Latest diamond rates fetched successfully').send(res);
  }

  const rates = await prisma.diamondRate.findMany({
    where,
    orderBy: [
      { effectiveDate: 'desc' },
      { createdAt: 'desc' }
    ],
    take: 100
  });

  ApiResponse.success(rates, 'Latest diamond rates fetched successfully').send(res);
});

// @desc    Get history of diamond rates
// @route   GET /api/v1/diamond-rates/history
// @access  Private/Admin
const getRateHistory = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const rates = await prisma.diamondRate.findMany({
    skip,
    take: limit,
    orderBy: [
      { effectiveDate: 'desc' },
      { createdAt: 'desc' }
    ],
    include: {
      updatedBy: {
        select: { name: true, email: true }
      }
    }
  });

  const total = await prisma.diamondRate.count();

  ApiResponse.success({ rates, total, page, pages: Math.ceil(total / limit) }, 'Diamond rate history fetched successfully').send(res);
});

// @desc    Update a diamond rate
// @route   PUT /api/v1/diamond-rates/:id
// @access  Private/Admin
const updateRate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cut, color, clarity, ratePerCarat, effectiveDate } = req.body;

  const rate = await prisma.diamondRate.findUnique({ where: { id } });
  if (!rate) {
    throw new ApiError(404, 'Diamond rate not found');
  }

  const updatedRate = await prisma.diamondRate.update({
    where: { id },
    data: {
      cut: cut || undefined,
      color: color || undefined,
      clarity: clarity || undefined,
      ratePerCarat: ratePerCarat !== undefined ? ratePerCarat : undefined,
      effectiveDate: effectiveDate || undefined,
      updatedById: req.user?.id
    }
  });

  // Background recalculation 
  recalculateDiamondProducts(updatedRate).catch(err => {
    console.error("Error recalculating diamond products after rate update:", err);
  });

  ApiResponse.success(updatedRate, 'Diamond rate updated successfully').send(res);
});

// @desc    Delete a diamond rate
// @route   DELETE /api/v1/diamond-rates/:id
// @access  Private/Admin
const deleteRate = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const rate = await prisma.diamondRate.findUnique({ where: { id } });
  if (!rate) {
    throw new ApiError(404, 'Diamond rate not found');
  }

  await prisma.diamondRate.delete({ where: { id } });
  ApiResponse.success({}, 'Diamond rate deleted successfully').send(res);
});

/**
 * Recalculate prices for all diamond products
 */
const recalculateDiamondProducts = async (rate) => {
  const productService = require('../product/product.service');
  
  if (productService.recalculatePricesForDiamond) {
      await productService.recalculatePricesForDiamond(rate);
  } else {
      console.warn("productService.recalculatePricesForDiamond not implemented yet");
  }
};

module.exports = {
  addRate,
  getLatestRates,
  getRateHistory,
  updateRate,
  deleteRate
};
