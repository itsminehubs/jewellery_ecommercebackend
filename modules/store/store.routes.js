const express = require('express');
const router = express.Router();
const storeController = require('./store.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');

router.get('/', storeController.getAllStores);
router.get('/:shopId', storeController.getStoreByShopId);

// Admin only routes
router.post('/', authenticate, checkPermission(PERMISSIONS.MANAGE_STORES), storeController.createStore);
router.put('/:id', authenticate, checkPermission(PERMISSIONS.MANAGE_STORES), storeController.updateStore);
router.delete('/:id', authenticate, checkPermission(PERMISSIONS.MANAGE_STORES), storeController.deleteStore);


module.exports = router;
