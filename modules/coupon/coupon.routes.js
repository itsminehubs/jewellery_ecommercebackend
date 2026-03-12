const express = require('express');
const router = express.Router();
const couponController = require('./coupon.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

router.post('/validate', authenticate, couponController.validateCoupon);
router.get('/', authenticate, couponController.getCoupons);

// Admin only routes
router.post('/', authenticate, authorize('admin'), couponController.createCoupon);
router.put('/:id', authenticate, authorize('admin'), couponController.updateCoupon);
router.delete('/:id', authenticate, authorize('admin'), couponController.deleteCoupon);

module.exports = router;
