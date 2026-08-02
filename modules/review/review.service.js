const Review = require('./review.model');
const Product = require('../product/product.model');
const Order = require('../order/order.model');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

// Basic bad word filter
const { Filter } = require('bad-words');
const filter = new Filter();

const createReview = async (reviewData) => {
    const { user, product, rating, title, comment, images, guestName, guestEmail } = reviewData;

    // Spam / Bad word check
    if (filter.isProfane(title) || filter.isProfane(comment)) {
        throw ApiError.badRequest('Review contains inappropriate language.');
    }

    let isVerifiedPurchase = false;

    // Check verified purchase
    if (user) {
        const hasPurchased = await Order.findOne({
            user: user,
            'items.product': product,
            status: { $in: ['Delivered', 'Completed'] }
        });
        if (hasPurchased) {
            isVerifiedPurchase = true;
        }

        // Check if user already reviewed (Recommended behavior: UPDATE instead of CREATE)
        const existingReview = await Review.findOne({ user, product });
        if (existingReview) {
            existingReview.rating = rating;
            existingReview.title = title;
            existingReview.comment = comment;
            existingReview.images = images;
            existingReview.status = 'pending'; // Re-moderate on edit
            existingReview.isVerifiedPurchase = isVerifiedPurchase;
            await existingReview.save();
            logger.info(`Review updated for product ${product} by user ${user}`);
            return existingReview;
        }
    }

    const review = await Review.create({
        user,
        guestName,
        guestEmail,
        product,
        rating,
        title,
        comment,
        images,
        isVerifiedPurchase,
        status: 'pending' // Admin must approve
    });

    logger.info(`Review submitted for product ${product}`);
    return review;
};

const mongoose = require('mongoose');

const getProductReviews = async (productId, options = {}) => {
    const { page = 1, limit = 10, sort = 'latest', rating, withImages } = options;
    const skip = (page - 1) * limit;

    const matchQuery = { 
        product: new mongoose.Types.ObjectId(productId), 
        status: 'approved' 
    };
    
    if (rating) {
        matchQuery.rating = parseInt(rating);
    }
    
    if (withImages === 'true') {
        matchQuery.images = { $exists: true, $not: { $size: 0 } };
    }

    let sortQuery = { createdAt: -1 };
    
    // Smart Ranking Algorithm
    if (sort === 'top') {
        const pipeline = [
            { $match: matchQuery },
            {
                $addFields: {
                    score: {
                        $add: [
                            { $multiply: ['$rating', 0.4] },
                            { $multiply: ['$helpfulCount', 0.4] },
                            { $cond: [{ $eq: ['$isVerifiedPurchase', true] }, 0.2, 0] }
                        ]
                    }
                }
            },
            { $sort: { score: -1, createdAt: -1 } },
            { $skip: skip },
            { $limit: parseInt(limit) }
        ];
        
        var reviews = await Review.aggregate(pipeline);
        await Review.populate(reviews, { path: 'user', select: 'name avatar' });
        await Review.populate(reviews, { path: 'reply.adminId', select: 'name' });
    } else {
        var reviews = await Review.find(matchQuery)
            .populate('user', 'name avatar')
            .populate('reply.adminId', 'name')
            .sort(sortQuery)
            .skip(skip)
            .limit(parseInt(limit));
    }

    const total = await Review.countDocuments(matchQuery);

    // Aggregate rating distribution
    const distributionStats = await Review.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(productId), status: 'approved' } },
        { $group: { _id: '$rating', count: { $sum: 1 } } }
    ]);

    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    distributionStats.forEach(stat => {
        if (ratingDistribution[stat._id] !== undefined) {
            ratingDistribution[stat._id] = stat.count;
        }
    });

    return { reviews, total, page: parseInt(page), limit: parseInt(limit), ratingDistribution };
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

const rejectReview = async (reviewId) => {
    const review = await Review.findById(reviewId);
    if (!review) throw ApiError.notFound('Review not found');
    review.status = 'rejected';
    await review.save();
    return review;
};

const replyToReview = async (reviewId, message, adminId) => {
    const review = await Review.findById(reviewId);
    if (!review) throw ApiError.notFound('Review not found');
    
    review.reply = {
        message,
        adminId,
        date: new Date()
    };
    await review.save();
    return review;
};

const markHelpful = async (reviewId) => {
    const review = await Review.findByIdAndUpdate(reviewId, { $inc: { helpfulCount: 1 } }, { new: true });
    return review;
};

const markNotHelpful = async (reviewId) => {
    const review = await Review.findByIdAndUpdate(reviewId, { $inc: { notHelpfulCount: 1 } }, { new: true });
    return review;
};

const reportReview = async (reviewId, reason) => {
    const review = await Review.findById(reviewId);
    if (!review) throw ApiError.notFound('Review not found');
    review.reported = true;
    if (reason) {
        review.reportReasons.push(reason);
    }
    await review.save();
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
    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 20;
    const skip = (page - 1) * limit;

    // Create a clean match query
    const matchQuery = {};
    if (query.status) {
        matchQuery.status = query.status;
    }
    if (query.product) {
        matchQuery.product = query.product;
    }
    if (query.user) {
        matchQuery.user = query.user;
    }

    const reviews = await Review.find(matchQuery)
        .populate('user', 'name email')
        .populate('product', 'name sku')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit);

    const total = await Review.countDocuments(matchQuery);
    return { reviews, total, page, limit };
};

const deleteReview = async (reviewId) => {
    const review = await Review.findById(reviewId);
    if (!review) throw ApiError.notFound('Review not found');

    const productId = review.product;
    await review.deleteOne();

    // Update product average rating since a review was removed
    await updateProductRating(productId);

    logger.info(`Review ${reviewId} deleted`);
    return true;
};

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
