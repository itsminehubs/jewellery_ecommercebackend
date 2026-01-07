const express = require('express');
const router = express.Router();
const paymentController = require('./payment.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');
const { paymentLimiter } = require('../../middlewares/rateLimiter.middleware');

router.post('/create-order', authenticate, paymentLimiter, paymentController.createPaymentOrder);
router.post('/verify', authenticate, paymentController.verifyPayment);
router.post('/refund/:orderId', authenticate, isAdmin, paymentController.refundPayment);

module.exports = router;