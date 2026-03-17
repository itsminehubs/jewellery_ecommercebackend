const express = require('express');
const router = express.Router();
const couponController = require('./coupon.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');

router.post('/validate', authenticate, couponController.validateCoupon);
router.get('/', authenticate, couponController.getCoupons);

// Admin only routes
router.post('/', authenticate, isAdmin, couponController.createCoupon);
router.put('/:id', authenticate, isAdmin, couponController.updateCoupon);
router.delete('/:id', authenticate, isAdmin, couponController.deleteCoupon);

module.exports = router;
