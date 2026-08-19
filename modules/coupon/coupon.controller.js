const couponService = require('./coupon.service');
const { asyncHandler } = require('../../middlewares/error.middleware');
const ApiResponse = require('../../utils/ApiResponse');
const prisma = require('../../config/prisma');

const mapCouponData = (data) => {
    const mapped = { ...data };
    
    // Map names
    if (mapped.expiryDate) {
        mapped.endDate = new Date(mapped.expiryDate);
        delete mapped.expiryDate;
    }
    
    // StartDate is required in Prisma, default to now if not provided
    if (mapped.startDate) {
        mapped.startDate = new Date(mapped.startDate);
    } else if (!data.id) { // Only set default on create
        mapped.startDate = new Date();
    }

    if (mapped.minPurchase !== undefined) {
        mapped.minOrderAmount = mapped.minPurchase;
        delete mapped.minPurchase;
    }

    // Drop fields not in Prisma schema
    delete mapped.perUserLimit;

    // Type casting
    if (mapped.usageLimit !== undefined) {
        mapped.usageLimit = mapped.usageLimit === '' || mapped.usageLimit === null ? null : parseInt(mapped.usageLimit);
    }
    if (mapped.discountValue !== undefined) mapped.discountValue = Number(mapped.discountValue);
    if (mapped.maxDiscount !== undefined && mapped.maxDiscount !== '') mapped.maxDiscount = Number(mapped.maxDiscount);
    if (mapped.minOrderAmount !== undefined) mapped.minOrderAmount = Number(mapped.minOrderAmount);

    return mapped;
};

const createCoupon = asyncHandler(async (req, res) => {
    const mappedData = mapCouponData(req.body);
    const coupon = await prisma.coupon.create({ data: mappedData });
    ApiResponse.created(coupon, 'Coupon created successfully').send(res);
});

const validateCoupon = asyncHandler(async (req, res) => {
    const { code, cartTotal } = req.body;
    const coupon = await couponService.validateCoupon(code, req.user.id, cartTotal);
    const discountAmount = couponService.calculateDiscount(coupon, cartTotal);

    ApiResponse.success({ coupon, discountAmount }, 'Coupon is valid').send(res);
});

const getCoupons = asyncHandler(async (req, res) => {
    const query = req.user.role === 'ADMIN' || req.user.role === 'admin' 
        ? {} 
        : { isActive: true, endDate: { gt: new Date() } };
        
    const coupons = await prisma.coupon.findMany({
        where: query,
        orderBy: { createdAt: 'desc' }
    });
    ApiResponse.success(coupons, 'Coupons fetched successfully').send(res);
});

const updateCoupon = asyncHandler(async (req, res) => {
    const mappedData = mapCouponData(req.body);
    const coupon = await prisma.coupon.update({
        where: { id: req.params.id },
        data: mappedData
    });
    if (!coupon) throw ApiError.notFound('Coupon not found');
    ApiResponse.success(coupon, 'Coupon updated successfully').send(res);
});

const deleteCoupon = asyncHandler(async (req, res) => {
    const coupon = await prisma.coupon.delete({
        where: { id: req.params.id }
    });
    if (!coupon) throw ApiError.notFound('Coupon not found');
    ApiResponse.success(null, 'Coupon deleted successfully').send(res);
});

module.exports = {
    createCoupon,
    validateCoupon,
    getCoupons,
    updateCoupon,
    deleteCoupon
};
