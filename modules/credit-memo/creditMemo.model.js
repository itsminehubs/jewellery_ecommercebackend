const mongoose = require('mongoose');

const creditMemoSchema = new mongoose.Schema({
    memoId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    originalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    balance: {
        type: Number,
        required: true,
        min: 0
    },
    totalProductPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    remainingAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'card', 'upi', 'bank_transfer', 'exchange'],
        required: true
    },
    linkedItems: [{
        product: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Product',
            required: true 
        },
        notes: String
    }],
    status: {
        type: String,
        enum: ['active', 'partially_used', 'used', 'refunded', 'cancelled'],
        default: 'active'
    },
    notes: String,
    shop_id: {
        type: String,
        required: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    redemptions: [{
        orderId: { type: String },
        amountUsed: { type: Number },
        date: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

// Auto-update status before saving
creditMemoSchema.pre('save', async function () {
    if (this.balance === 0 && (this.status === 'active' || this.status === 'partially_used')) {
        this.status = 'used';
    } else if (this.balance > 0 && this.balance < this.originalAmount && this.status === 'active') {
        this.status = 'partially_used';
    }
    
    // Auto-calculate remaining amount if total product price exists
    if (this.totalProductPrice > 0) {
        this.remainingAmount = Math.max(0, this.totalProductPrice - this.originalAmount);
    } else {
        this.remainingAmount = 0;
    }
});

module.exports = mongoose.model('CreditMemo', creditMemoSchema);
