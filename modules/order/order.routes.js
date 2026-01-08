const express = require('express');
const router = express.Router();
const orderController = require('./order.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { orderLimiter } = require('../../middlewares/rateLimiter.middleware');

router.post('/', authenticate, orderLimiter, orderController.createOrder);
router.get('/', authenticate, orderController.getUserOrders);
router.get('/:id', authenticate, orderController.getOrder);
router.patch('/:id/cancel', authenticate, orderController.cancelOrder);
router.delete('/:id/fail', authenticate, orderController.deleteOrder);

module.exports = router;