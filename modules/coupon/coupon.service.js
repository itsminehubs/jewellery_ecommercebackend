const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');

/**
 * Validate a coupon code
 * @param {string} code 
 * @param {string} userId 
 * @param {number} cartTotal 
 */
const validateCoupon = async (code, userId, cartTotal) => {
    const coupon = await prisma.coupon.findUnique({ where: { code } });

    if (!coupon || !coupon.isActive) {
        throw ApiError.notFound('Invalid or inactive coupon code');
    }

    if (coupon.endDate < new Date()) {
        throw ApiError.badRequest('Coupon has expired');
    }

    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
        throw ApiError.badRequest('Coupon usage limit reached');
    }

    if (cartTotal < Number(coupon.minOrderAmount)) {
        throw ApiError.badRequest(`Minimum purchase of ₹${coupon.minOrderAmount} required for this coupon`);
    }

    return coupon;
};

/**
 * Calculate discount
 * @param {Object} coupon 
 * @param {number} cartTotal 
 * @returns {number}
 */
const calculateDiscount = (coupon, cartTotal) => {
    let discount = 0;
    const discountValue = Number(coupon.discountValue);
    
    if (coupon.discountType === 'percentage') {
        discount = (cartTotal * discountValue) / 100;
        if (coupon.maxDiscount && discount > Number(coupon.maxDiscount)) {
            discount = Number(coupon.maxDiscount);
        }
    } else {
        discount = discountValue;
    }
    return Math.min(discount, cartTotal);
};

module.exports = {
    validateCoupon,
    calculateDiscount
};
