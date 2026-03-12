const express = require('express');
const router = express.Router();
const storeController = require('./store.controller');
const { auth, isAdmin } = require('../../middlewares/auth.middleware');

router.get('/', storeController.getAllStores);
router.get('/:shopId', storeController.getStoreByShopId);

// Admin only routes
router.post('/', auth, isAdmin, storeController.createStore);
router.put('/:id', auth, isAdmin, storeController.updateStore);
router.delete('/:id', auth, isAdmin, storeController.deleteStore);

module.exports = router;
