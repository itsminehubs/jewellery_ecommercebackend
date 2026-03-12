const express = require('express');
const router = express.Router();
const posOrderController = require('./pos-order.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate); // All POS routes require authentication

router.post('/', posOrderController.createOrder);
router.get('/', posOrderController.getStoreOrders);
router.get('/analytics', posOrderController.getStoreAnalytics);
router.get('/:id', posOrderController.getOrderById);

module.exports = router;
