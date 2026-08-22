const express = require('express');
const router = express.Router();
const imitationSaleController = require('./imitation-sale.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { hasRole } = require('../../middlewares/admin.middleware');
const { USER_ROLES } = require('../../utils/constants');

// All endpoints require auth
router.use(authenticate);

// POS Endpoints (Staff can create & view)
router.post('/', imitationSaleController.createImitationSale);
router.get('/', imitationSaleController.getImitationSales);
router.get('/:id', imitationSaleController.getImitationSaleById);

// Admin Endpoints
const adminRoles = [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.STORE_MANAGER];

router.put('/:id', hasRole(adminRoles), imitationSaleController.updateImitationSale);
router.delete('/:id', hasRole(adminRoles), imitationSaleController.deleteImitationSale);

module.exports = router;
