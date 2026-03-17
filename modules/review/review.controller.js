const reviewService = require('./review.service');
const { asyncHandler } = require('../../middlewares/error.middleware');
const ApiResponse = require('../../utils/ApiResponse');

const createReview = asyncHandler(async (req, res) => {
    const review = await reviewService.createReview({
        ...req.body,
        user: req.user._id,
        images: req.files ? req.files.map(file => ({ url: file.path, public_id: file.filename })) : []
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

const getAllReviews = asyncHandler(async (req, res) => {
    const result = await reviewService.getAllReviews(req.query, req.query);
    ApiResponse.paginated(result.reviews, result.page, result.limit, result.total).send(res);
});

module.exports = {
    createReview,
    getProductReviews,
    approveReview,
    getAllReviews
};
