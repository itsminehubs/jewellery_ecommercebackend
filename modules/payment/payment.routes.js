const express = require('express');
const router = express.Router();
const paymentController = require('./payment.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');
const { paymentLimiter } = require('../../middlewares/rateLimiter.middleware');

router.post('/create-order', authenticate, paymentLimiter, paymentController.createPaymentOrder);
router.post('/verify', authenticate, paymentController.verifyPayment);
router.post('/refund/:orderId', authenticate, isAdmin, paymentController.refundPayment);
router.put('/:orderId/fail', authenticate, paymentController.markPaymentFailed); // NEW route
router.get(
  '/my-payments',
  authenticate,
  paymentController.getMyPayments
);
router.get(
  '/admin/payments',
  authenticate,
  isAdmin,
  paymentController.getAllPayments
);
router.get(
  '/admin/payments/:orderId',
  authenticate,
  isAdmin,
  paymentController.getPaymentByOrderId
);

module.exports = router;