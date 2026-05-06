const express = require('express');
const router = express.Router();
const reviewController = require('./review.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');
const { reviewImageUpload } = require('../../middlewares/upload.middleware');

// Public routes
router.get('/product/:productId', reviewController.getProductReviews);
router.post('/', reviewImageUpload, reviewController.createReview);

// Protected routes
router.use(authenticate);

// Admin routes
router.use(checkPermission(PERMISSIONS.MANAGE_REVIEWS));
router.get('/', reviewController.getAllReviews);
router.patch('/:reviewId/approve', reviewController.approveReview);

module.exports = router;
