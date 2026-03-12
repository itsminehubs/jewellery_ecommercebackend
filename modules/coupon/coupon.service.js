const Coupon = require('./coupon.model');
const ApiError = require('../../utils/ApiError');

/**
 * Validate a coupon code
 * @param {string} code 
 * @param {string} userId 
 * @param {number} cartTotal 
 * @returns {Promise<Coupon>}
 */
const validateCoupon = async (code, userId, cartTotal) => {
    const coupon = await Coupon.findOne({ code, isActive: true });

    if (!coupon) {
        throw ApiError.notFound('Invalid or inactive coupon code');
    }

    if (coupon.expiryDate < new Date()) {
        throw ApiError.badRequest('Coupon has expired');
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        throw ApiError.badRequest('Coupon usage limit reached');
    }

    if (cartTotal < coupon.minPurchase) {
        throw ApiError.badRequest(`Minimum purchase of ₹${coupon.minPurchase} required for this coupon`);
    }

    // Check per user limit (this would normally require an Order check)
    // For now we'll assume a separate helper or check usage here if we track it per user

    return coupon;
};

/**
 * Calculate discount
 * @param {Coupon} coupon 
 * @param {number} cartTotal 
 * @returns {number}
 */
const calculateDiscount = (coupon, cartTotal) => {
    let discount = 0;
    if (coupon.discountType === 'percentage') {
        discount = (cartTotal * coupon.discountValue) / 100;
        if (coupon.maxDiscount && discount > coupon.maxDiscount) {
            discount = coupon.maxDiscount;
        }
    } else {
        discount = coupon.discountValue;
    }
    return Math.min(discount, cartTotal);
};

module.exports = {
    validateCoupon,
    calculateDiscount
};
