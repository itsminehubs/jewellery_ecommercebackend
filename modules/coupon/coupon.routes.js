const express = require('express');
const router = express.Router();
const couponController = require('./coupon.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');

router.post('/validate', authenticate, couponController.validateCoupon);
router.get('/', authenticate, couponController.getCoupons);

// Admin only routes
router.post('/', authenticate, checkPermission(PERMISSIONS.MANAGE_COUPONS), couponController.createCoupon);
router.put('/:id', authenticate, checkPermission(PERMISSIONS.MANAGE_COUPONS), couponController.updateCoupon);
router.delete('/:id', authenticate, checkPermission(PERMISSIONS.MANAGE_COUPONS), couponController.deleteCoupon);


module.exports = router;
