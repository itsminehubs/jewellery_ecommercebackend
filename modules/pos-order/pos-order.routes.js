const express = require('express');
const router = express.Router();
const posOrderController = require('./pos-order.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate); // All POS routes require authentication

router.post('/', posOrderController.createOrder);
router.post('/calculate-cart', posOrderController.calculateCart);
router.get('/store', posOrderController.getStoreOrders);
router.get('/', posOrderController.getStoreOrders);
router.get('/analytics', posOrderController.getStoreAnalytics);
router.get('/:id', posOrderController.getOrderById);
router.put('/:id', posOrderController.updateOrder);
router.post('/:id/return', posOrderController.processReturn);

module.exports = router;
