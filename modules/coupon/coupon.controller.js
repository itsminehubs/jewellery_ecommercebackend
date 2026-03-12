const couponService = require('./coupon.service');
const Coupon = require('./coupon.model');
const { asyncHandler } = require('../../middlewares/error.middleware');
const ApiResponse = require('../../utils/ApiResponse');

const createCoupon = asyncHandler(async (req, res) => {
    const coupon = await Coupon.create(req.body);
    ApiResponse.created(coupon, 'Coupon created successfully').send(res);
});

const validateCoupon = asyncHandler(async (req, res) => {
    const { code, cartTotal } = req.body;
    const coupon = await couponService.validateCoupon(code, req.user._id, cartTotal);
    const discountAmount = couponService.calculateDiscount(coupon, cartTotal);

    ApiResponse.success({ coupon, discountAmount }, 'Coupon is valid').send(res);
});

const getCoupons = asyncHandler(async (req, res) => {
    // Admins see all coupons, users only see active/not-expired
    const query = req.user.role === 'admin' ? {} : { isActive: true, expiryDate: { $gt: new Date() } };
    const coupons = await Coupon.find(query).sort({ createdAt: -1 });
    ApiResponse.success(coupons, 'Coupons fetched successfully').send(res);
});

const updateCoupon = asyncHandler(async (req, res) => {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!coupon) throw ApiError.notFound('Coupon not found');
    ApiResponse.success(coupon, 'Coupon updated successfully').send(res);
});

const deleteCoupon = asyncHandler(async (req, res) => {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
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
