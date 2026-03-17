const express = require('express');
const router = express.Router();
const reviewController = require('./review.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');
const { reviewImageUpload } = require('../../middlewares/upload.middleware');

// Public routes
router.get('/product/:productId', reviewController.getProductReviews);

// Protected routes
router.use(authenticate);
router.post('/', reviewImageUpload, reviewController.createReview);

// Admin routes
router.use(isAdmin);
router.get('/', reviewController.getAllReviews);
router.patch('/:reviewId/approve', reviewController.approveReview);

module.exports = router;
