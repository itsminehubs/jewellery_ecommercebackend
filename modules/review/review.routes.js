const express = require('express');
const router = express.Router();
const reviewController = require('./review.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');
const { reviewImageUpload } = require('../../middlewares/upload.middleware');

const rateLimit = require('express-rate-limit');

// Rate limiting for review submission
const reviewLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 3, // limit each IP to 3 reviews per windowMs
    message: { success: false, message: 'Too many reviews submitted from this IP, please try again after 24 hours' }
});

// Public routes
router.get('/product/:productId', reviewController.getProductReviews);
router.post('/', reviewLimiter, reviewImageUpload, reviewController.createReview);
router.patch('/:reviewId/helpful', reviewController.markHelpful);
router.patch('/:reviewId/not-helpful', reviewController.markNotHelpful);
router.patch('/:reviewId/report', reviewController.reportReview);

// Protected routes
router.use(authenticate);

// Admin routes
router.use(checkPermission(PERMISSIONS.MANAGE_REVIEWS));
router.get('/', reviewController.getAllReviews);
router.patch('/:reviewId/approve', reviewController.approveReview);
router.patch('/:reviewId/reject', reviewController.rejectReview);
router.post('/:reviewId/reply', reviewController.replyToReview);
router.delete('/:reviewId', reviewController.deleteReview);

module.exports = router;
