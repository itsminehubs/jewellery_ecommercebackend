const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    guestName: {
        type: String,
        trim: true,
        maxLength: 50
    },
    guestEmail: {
        type: String,
        trim: true,
        lowercase: true
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    title: {
        type: String,
        trim: true,
        maxLength: 100
    },
    comment: {
        type: String,
        required: true,
        trim: true,
        maxLength: 1000
    },
    images: [{
        url: String,
        public_id: String
    }],
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    isVerifiedPurchase: {
        type: Boolean,
        default: false
    },
    helpfulCount: {
        type: Number,
        default: 0
    },
    notHelpfulCount: {
        type: Number,
        default: 0
    },
    reported: {
        type: Boolean,
        default: false
    },
    reportReasons: [{
        type: String
    }],
    reply: {
        message: String,
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        date: Date
    }
}, { timestamps: true });

// Index for fetching product reviews faster
reviewSchema.index({ product: 1, status: 1 });

module.exports = mongoose.model('Review', reviewSchema);
