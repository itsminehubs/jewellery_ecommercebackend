const express = require('express');
const repairController = require('./repair.controller');
const authController = require('../auth/auth.controller');

const router = express.Router();

// Protect all routes
router.use(authController.protect);

// Frontend specific routes
router.get('/my-repairs', repairController.getMyRepairs);

// POS and Admin Routes
router
    .route('/')
    .get(
        authController.restrictTo('admin', 'pos_user', 'super_admin'),
        repairController.getAllRepairs
    )
    .post(
        authController.restrictTo('admin', 'pos_user', 'super_admin'),
        repairController.createRepair
    );

router
    .route('/:id')
    .get(
        authController.restrictTo('admin', 'pos_user', 'super_admin'),
        repairController.getRepair
    )
    .put(
        authController.restrictTo('admin', 'pos_user', 'super_admin'),
        repairController.updateRepair
    )
    .delete(
        // Strict restriction: Only Admin can delete
        authController.restrictTo('admin', 'super_admin'),
        repairController.deleteRepair
    );

module.exports = router;
