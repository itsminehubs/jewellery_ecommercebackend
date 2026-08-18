const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const { Filter } = require('bad-words');

const filter = new Filter();

const createReview = async (reviewData) => {
    const { user, product, rating, title, comment, images, guestName, guestEmail } = reviewData;

    // Spam / Bad word check
    if ((title && filter.isProfane(title)) || (comment && filter.isProfane(comment))) {
        throw ApiError.badRequest('Review contains inappropriate language.');
    }

    let isVerifiedPurchase = false;

    // Check verified purchase
    if (user) {
        const hasPurchased = await prisma.order.findFirst({
            where: {
                userId: user,
                status: { in: ['Delivered', 'Completed'] },
                items: {
                    some: { productId: product }
                }
            }
        });

        if (hasPurchased) {
            isVerifiedPurchase = true;
        }

        // Check if user already reviewed
        const existingReview = await prisma.review.findFirst({
            where: { userId: user, productId: product }
        });

        if (existingReview) {
            const updatedReview = await prisma.review.update({
                where: { id: existingReview.id },
                data: {
                    rating: Number(rating),
                    title,
                    comment,
                    images: images || existingReview.images,
                    status: 'pending', // Re-moderate on edit
                    isVerifiedPurchase
                }
            });
            logger.info(`Review updated for product ${product} by user ${user}`);
            return updatedReview;
        }
    }

    const review = await prisma.review.create({
        data: {
            userId: user || undefined,
            guestName,
            guestEmail,
            productId: product,
            rating: Number(rating),
            title,
            comment,
            images,
            isVerifiedPurchase,
            status: 'pending' // Admin must approve
        }
    });

    logger.info(`Review submitted for product ${product}`);
    return review;
};

const getProductReviews = async (productId, options = {}) => {
    const { page = 1, limit = 10, sort = 'latest', rating, withImages } = options;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
        productId,
        status: 'approved'
    };

    if (rating) {
        where.rating = Number(rating);
    }

    if (withImages === 'true') {
        where.images = { not: null };
        // Prisma doesn't easily do array size checks in JSON without raw queries,
        // so we'll just check it's not null.
    }

    let orderBy = { createdAt: 'desc' };

    // Smart Ranking Algorithm
    if (sort === 'top') {
        // Since we can't easily do complex math ordering in Prisma, 
        // we'll fetch them, calculate score, and sort in memory if the dataset isn't huge.
        // For production scale, you'd want a raw query or a generated score column.
        const allReviews = await prisma.review.findMany({
            where,
            include: { user: { select: { name: true, profileImageUrl: true } } }
        });

        const scoredReviews = allReviews.map(r => {
            const score = (r.rating * 0.4) + (r.helpfulCount * 0.4) + (r.isVerifiedPurchase ? 0.2 : 0);
            return { ...r, score };
        });

        scoredReviews.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);
        
        const reviews = scoredReviews.slice(skip, skip + Number(limit));
        const total = allReviews.length;

        const ratingDistribution = await getRatingDistribution(productId);
        return { reviews, total, page: Number(page), limit: Number(limit), ratingDistribution };
    } else {
        const reviews = await prisma.review.findMany({
            where,
            orderBy,
            skip,
            take: Number(limit),
            include: { user: { select: { name: true, profileImageUrl: true } } }
        });

        const total = await prisma.review.count({ where });
        const ratingDistribution = await getRatingDistribution(productId);

        return { reviews, total, page: Number(page), limit: Number(limit), ratingDistribution };
    }
};

const getRatingDistribution = async (productId) => {
    const distributionStats = await prisma.review.groupBy({
        by: ['rating'],
        where: { productId, status: 'approved' },
        _count: { rating: true }
    });

    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    distributionStats.forEach(stat => {
        if (ratingDistribution[stat.rating] !== undefined) {
            ratingDistribution[stat.rating] = stat._count.rating;
        }
    });

    return ratingDistribution;
};

const updateProductRating = async (productId) => {
    const stats = await prisma.review.aggregate({
        where: { productId, status: 'approved' },
        _avg: { rating: true },
        _count: { id: true }
    });

    if (stats._count.id > 0) {
        await prisma.product.update({
            where: { id: productId },
            data: {
                rating: Math.round(stats._avg.rating * 10) / 10,
                numReviews: stats._count.id
            }
        });
    } else {
        await prisma.product.update({
            where: { id: productId },
            data: { rating: 0, numReviews: 0 }
        });
    }
};

const approveReview = async (reviewId) => {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw ApiError.notFound('Review not found');

    const updatedReview = await prisma.review.update({
        where: { id: reviewId },
        data: { status: 'approved' }
    });

    // Update product average rating
    await updateProductRating(review.productId);

    logger.info(`Review ${reviewId} approved`);
    return updatedReview;
};

const rejectReview = async (reviewId) => {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw ApiError.notFound('Review not found');

    const updatedReview = await prisma.review.update({
        where: { id: reviewId },
        data: { status: 'rejected' }
    });
    return updatedReview;
};

const replyToReview = async (reviewId, message, adminId) => {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw ApiError.notFound('Review not found');
    
    const replyData = {
        message,
        adminId,
        date: new Date().toISOString()
    };

    const updatedReview = await prisma.review.update({
        where: { id: reviewId },
        data: { reply: replyData }
    });
    return updatedReview;
};

const markHelpful = async (reviewId) => {
    const review = await prisma.review.update({
        where: { id: reviewId },
        data: { helpfulCount: { increment: 1 } }
    });
    return review;
};

const markNotHelpful = async (reviewId) => {
    const review = await prisma.review.update({
        where: { id: reviewId },
        data: { notHelpfulCount: { increment: 1 } }
    });
    return review;
};

const reportReview = async (reviewId, reason) => {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw ApiError.notFound('Review not found');

    let reasons = review.reportReasons ? (Array.isArray(review.reportReasons) ? [...review.reportReasons] : []) : [];
    if (reason) reasons.push(reason);

    const updatedReview = await prisma.review.update({
        where: { id: reviewId },
        data: { reported: true, reportReasons: reasons }
    });
    return updatedReview;
};

const getAllReviews = async (query = {}, options = {}) => {
    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 20;
    const skip = (page - 1) * limit;

    const where = {};
    if (query.status) where.status = query.status;
    if (query.product) where.productId = query.product;
    if (query.user) where.userId = query.user;

    const reviews = await prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
            user: { select: { name: true, email: true } },
            product: { select: { name: true, sku: true } }
        }
    });

    const total = await prisma.review.count({ where });
    return { reviews, total, page, limit };
};

const deleteReview = async (reviewId) => {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw ApiError.notFound('Review not found');

    const productId = review.productId;
    await prisma.review.delete({ where: { id: reviewId } });

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
