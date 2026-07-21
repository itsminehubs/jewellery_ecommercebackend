const express = require('express');
const customOrderController = require('./customOrder.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');
const { singleImageUpload } = require('../../middlewares/upload.middleware');

const router = express.Router();

// Protect all routes
router.use(authenticate);

// Routes for both users and admins
router.post('/', singleImageUpload, customOrderController.createCustomOrder);
router.get('/my-orders', customOrderController.getMyCustomOrders);
router.put('/:id', singleImageUpload, customOrderController.updateCustomOrder);
router.get('/:id', customOrderController.getCustomOrderById);
router.delete('/:id', customOrderController.deleteCustomOrder);

// Admin-only routes
router.use(checkPermission(PERMISSIONS.ORDER_VIEW_ALL));
router.get('/', customOrderController.getAllCustomOrders);
router.put('/:id/status', customOrderController.updateCustomOrderStatus);

module.exports = router;
