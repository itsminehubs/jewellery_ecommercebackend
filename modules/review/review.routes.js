const express = require('express');
const router = express.Router();
const reviewController = require('./review.controller');
const { protect, restrictTo } = require('../../middleware/auth');
const { upload } = require('../../utils/cloudinary');

// Public routes
router.get('/product/:productId', reviewController.getProductReviews);

// Protected routes
router.use(protect);
router.post('/', upload.array('images', 5), reviewController.createReview);

// Admin routes
router.use(restrictTo('admin'));
router.get('/', reviewController.getAllReviews);
router.patch('/:reviewId/approve', reviewController.approveReview);

module.exports = router;
