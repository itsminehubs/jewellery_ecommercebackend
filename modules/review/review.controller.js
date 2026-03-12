const reviewService = require('./review.service');
const catchAsync = require('../../utils/catchAsync');
const sendResponse = require('../../utils/sendResponse');

const createReview = catchAsync(async (req, res) => {
    const review = await reviewService.createReview({
        ...req.body,
        user: req.user._id,
        images: req.files ? req.files.map(file => ({ url: file.path, public_id: file.filename })) : []
    });
    sendResponse(res, {
        statusCode: 201,
        success: true,
        message: 'Review submitted successfully. It will be visible after approval.',
        data: review
    });
});

const getProductReviews = catchAsync(async (req, res) => {
    const result = await reviewService.getProductReviews(req.params.productId, req.query);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        data: result
    });
});

const approveReview = catchAsync(async (req, res) => {
    const review = await reviewService.approveReview(req.params.reviewId);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'Review approved successfully',
        data: review
    });
});

const getAllReviews = catchAsync(async (req, res) => {
    const result = await reviewService.getAllReviews(req.query, req.query);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        data: result
    });
});

module.exports = {
    createReview,
    getProductReviews,
    approveReview,
    getAllReviews
};
