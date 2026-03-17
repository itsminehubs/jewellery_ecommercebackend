const express = require('express');
const router = express.Router();
const storeController = require('./store.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');

router.get('/', storeController.getAllStores);
router.get('/:shopId', storeController.getStoreByShopId);

// Admin only routes
router.post('/', authenticate, isAdmin, storeController.createStore);
router.put('/:id', authenticate, isAdmin, storeController.updateStore);
router.delete('/:id', authenticate, isAdmin, storeController.deleteStore);

module.exports = router;
