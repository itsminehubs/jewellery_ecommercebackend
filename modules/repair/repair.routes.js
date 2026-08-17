const express = require('express');
const repairController = require('./repair.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { hasRole } = require('../../middlewares/admin.middleware');

const router = express.Router();

// Protect all routes
router.use(authenticate);

// Frontend specific routes
router.get('/my-repairs', repairController.getMyRepairs);

// POS and Admin Routes
router
    .route('/')
    .get(
        hasRole(['admin', 'store_manager', 'sales_staff', 'super_admin']),
        repairController.getAllRepairs
    )
    .post(
        hasRole(['admin', 'store_manager', 'sales_staff', 'super_admin']),
        repairController.createRepair
    );

router
    .route('/:id')
    .get(
        hasRole(['admin', 'store_manager', 'sales_staff', 'super_admin']),
        repairController.getRepair
    )
    .put(
        hasRole(['admin', 'store_manager', 'sales_staff', 'super_admin']),
        repairController.updateRepair
    )
    .delete(
        // Strict restriction: Only Admin can delete
        hasRole(['admin', 'super_admin']),
        repairController.deleteRepair
    );

module.exports = router;
