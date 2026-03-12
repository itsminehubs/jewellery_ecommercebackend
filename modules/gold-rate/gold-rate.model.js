const mongoose = require('mongoose');

const goldRateSchema = new mongoose.Schema({
    metal: {
        type: String,
        required: true,
        enum: ['gold', 'silver', 'platinum'],
        lowercase: true,
    },
    purity: {
        type: String,
        required: true, // e.g., '18K', '22K', '24K' for gold, '925' for silver
    },
    ratePerGram: {
        type: Number,
        required: true,
    },
    effectiveDate: {
        type: Date,
        default: Date.now,
        index: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }
}, {
    timestamps: true,
});

// Compound index to quickly find the latest rate for a specific metal and purity
goldRateSchema.index({ metal: 1, purity: 1, effectiveDate: -1 });

const GoldRate = mongoose.model('GoldRate', goldRateSchema);

module.exports = GoldRate;
