const express = require('express');
const router = express.Router();
const paymentController = require('./payment.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');
const { paymentLimiter } = require('../../middlewares/rateLimiter.middleware');

router.post('/create-order', authenticate, paymentLimiter, paymentController.createPaymentOrder);
router.post('/verify', authenticate, paymentController.verifyPayment);
router.post('/refund/:orderId', authenticate, checkPermission(PERMISSIONS.ORDER_REFUND), paymentController.refundPayment);
router.put('/:orderId/fail', authenticate, paymentController.markPaymentFailed); // NEW route
router.get(
  '/my-payments',
  authenticate,
  paymentController.getMyPayments
);
router.get(
  '/admin/payments',
  authenticate,
  checkPermission(PERMISSIONS.ORDER_VIEW_ALL),
  paymentController.getAllPayments
);
router.get(
  '/admin/payments/:orderId',
  authenticate,
  checkPermission(PERMISSIONS.ORDER_VIEW_ALL),
  paymentController.getPaymentByOrderId
);

module.exports = router;