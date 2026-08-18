const express = require('express');
const repairController = require('./repair.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

const restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(ApiError.forbidden('You do not have permission to perform this action'));
        }
        next();
    };
};

// Protect all routes
router.use(authenticate);

// Frontend specific routes
router.get('/my-repairs', repairController.getMyRepairs);

// POS and Admin Routes
router
    .route('/')
    .get(
        restrictTo('admin', 'pos_user', 'super_admin'),
        repairController.getAllRepairs
    )
    .post(
        restrictTo('admin', 'pos_user', 'super_admin'),
        repairController.createRepair
    );

router
    .route('/:id')
    .get(
        restrictTo('admin', 'pos_user', 'super_admin'),
        repairController.getRepair
    )
    .put(
        restrictTo('admin', 'pos_user', 'super_admin'),
        repairController.updateRepair
    )
    .delete(
        // Strict restriction: Only Admin can delete
        restrictTo('admin', 'super_admin'),
        repairController.deleteRepair
    );

module.exports = router;
