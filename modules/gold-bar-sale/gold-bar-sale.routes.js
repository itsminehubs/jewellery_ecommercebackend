const express = require('express');
const router = express.Router();
const goldBarSaleController = require('./gold-bar-sale.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { hasRole } = require('../../middlewares/admin.middleware');
const { USER_ROLES } = require('../../utils/constants');

// All endpoints require auth
router.use(authenticate);

// Create Gold bar sale
router.post('/', goldBarSaleController.creategoldBarSale);

// Get all Gold bar sales (with pagination/search)
router.get('/', goldBarSaleController.getgoldBarSales);

// Get sale by ID
router.get('/:id', goldBarSaleController.getgoldBarSaleById);

// Update status/notes
router.patch('/:id', hasRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.STORE_MANAGER]), goldBarSaleController.updategoldBarSale);

// Soft delete
router.delete('/:id', hasRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), goldBarSaleController.deletegoldBarSale);

// Trigger nodemon restart
module.exports = router;
