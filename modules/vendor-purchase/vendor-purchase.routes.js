const express = require('express');
const router = express.Router();
const vendorController = require('./vendor.controller');
const poController = require('./purchase-order.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');

router.use(authenticate);

// Vendor Management
router.get('/vendors', checkPermission(PERMISSIONS.VENDOR_MANAGE), vendorController.getAllVendors);
router.post('/vendors', checkPermission(PERMISSIONS.VENDOR_MANAGE), vendorController.createVendor);
router.get('/vendors/:id', checkPermission(PERMISSIONS.VENDOR_MANAGE), vendorController.getVendorById);
router.patch('/vendors/:id', checkPermission(PERMISSIONS.VENDOR_MANAGE), vendorController.updateVendor);
router.delete('/vendors/:id', checkPermission(PERMISSIONS.VENDOR_MANAGE), vendorController.deleteVendor);

// Purchase Order Management
router.get('/purchase-orders', checkPermission(PERMISSIONS.PURCHASE_ORDER_VIEW), poController.getAllPOs);
router.post('/purchase-orders', checkPermission(PERMISSIONS.PURCHASE_ORDER_CREATE), poController.createPO);
router.get('/purchase-orders/:id', checkPermission(PERMISSIONS.PURCHASE_ORDER_VIEW), poController.getPOById);
router.patch('/purchase-orders/:id', checkPermission(PERMISSIONS.PURCHASE_ORDER_CREATE), poController.updatePO);
router.post('/purchase-orders/:id/receive', checkPermission(PERMISSIONS.PURCHASE_ORDER_RECEIVE), poController.receivePO);

module.exports = router;
