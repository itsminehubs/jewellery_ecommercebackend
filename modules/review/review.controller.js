const reviewService = require('./review.service');
const { asyncHandler } = require('../../middlewares/error.middleware');
const ApiResponse = require('../../utils/ApiResponse');
const { uploadMultipleImages } = require('../../config/s3');

const createReview = asyncHandler(async (req, res) => {
    let uploadedImages = [];
    if (req.files && req.files.length > 0) {
        uploadedImages = await uploadMultipleImages(req.files.map(file => file.path), 'reviews');
    }

    const review = await reviewService.createReview({
        ...req.body,
        user: req.user?.id,
        images: uploadedImages
    });
    ApiResponse.created(review, 'Review submitted successfully. It will be visible after approval.').send(res);
});

const getProductReviews = asyncHandler(async (req, res) => {
    const result = await reviewService.getProductReviews(req.params.productId, req.query);
    ApiResponse.success(result, 'Product reviews fetched').send(res);
});

const approveReview = asyncHandler(async (req, res) => {
    const review = await reviewService.approveReview(req.params.reviewId);
    ApiResponse.success(review, 'Review approved successfully').send(res);
});

const rejectReview = asyncHandler(async (req, res) => {
    const review = await reviewService.rejectReview(req.params.reviewId);
    ApiResponse.success(review, 'Review rejected').send(res);
});

const replyToReview = asyncHandler(async (req, res) => {
    const review = await reviewService.replyToReview(req.params.reviewId, req.body.message, req.user.id);
    ApiResponse.success(review, 'Reply posted successfully').send(res);
});

const markHelpful = asyncHandler(async (req, res) => {
    const review = await reviewService.markHelpful(req.params.reviewId);
    ApiResponse.success(review, 'Marked as helpful').send(res);
});

const markNotHelpful = asyncHandler(async (req, res) => {
    const review = await reviewService.markNotHelpful(req.params.reviewId);
    ApiResponse.success(review, 'Marked as not helpful').send(res);
});

const reportReview = asyncHandler(async (req, res) => {
    const review = await reviewService.reportReview(req.params.reviewId, req.body.reason);
    ApiResponse.success(review, 'Review reported for moderation').send(res);
});

const getAllReviews = asyncHandler(async (req, res) => {
    const result = await reviewService.getAllReviews(req.query, req.query);
    ApiResponse.paginated(result.reviews, result.page, result.limit, result.total).send(res);
});

const deleteReview = asyncHandler(async (req, res) => {
    await reviewService.deleteReview(req.params.reviewId);
    ApiResponse.success(null, 'Review deleted successfully').send(res);
});

module.exports = {
    createReview,
    getProductReviews,
    approveReview,
    rejectReview,
    replyToReview,
    markHelpful,
    markNotHelpful,
    reportReview,
    getAllReviews,
    deleteReview
};


