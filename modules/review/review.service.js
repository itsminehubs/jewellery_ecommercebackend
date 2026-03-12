const Review = require('./review.model');
const Product = require('../product/product.model');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

const createReview = async (reviewData) => {
    const { user, product, rating, title, comment, images } = reviewData;

    // Check if user already reviewed this product
    const existing = await Review.findOne({ user, product });
    if (existing) throw ApiError.conflict('You have already reviewed this product');

    const review = await Review.create({
        user,
        product,
        rating,
        title,
        comment,
        images,
        status: 'pending' // Admin must approve
    });

    logger.info(`Review submitted for product ${product} by user ${user}`);
    return review;
};

const getProductReviews = async (productId, options = {}) => {
    const { page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ product: productId, status: 'approved' })
        .populate('user', 'name avatar')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit);

    const total = await Review.countDocuments({ product: productId, status: 'approved' });

    return { reviews, total, page, limit };
};

const approveReview = async (reviewId) => {
    const review = await Review.findById(reviewId);
    if (!review) throw ApiError.notFound('Review not found');

    review.status = 'approved';
    await review.save();

    // Update product average rating
    await updateProductRating(review.product);

    logger.info(`Review ${reviewId} approved`);
    return review;
};

const updateProductRating = async (productId) => {
    const stats = await Review.aggregate([
        { $match: { product: productId, status: 'approved' } },
        {
            $group: {
                _id: '$product',
                avgRating: { $avg: '$rating' },
                numReviews: { $sum: 1 }
            }
        }
    ]);

    if (stats.length > 0) {
        await Product.findByIdAndUpdate(productId, {
            rating: Math.round(stats[0].avgRating * 10) / 10,
            numReviews: stats[0].numReviews
        });
    } else {
        await Product.findByIdAndUpdate(productId, {
            rating: 0,
            numReviews: 0
        });
    }
};

const getAllReviews = async (query = {}, options = {}) => {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const reviews = await Review.find(query)
        .populate('user', 'name email')
        .populate('product', 'name sku')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit);

    const total = await Review.countDocuments(query);
    return { reviews, total, page, limit };
};

module.exports = {
    createReview,
    getProductReviews,
    approveReview,
    getAllReviews
};
