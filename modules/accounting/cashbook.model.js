const mongoose = require('mongoose');

const dailyCashbookSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        unique: true,
        index: true
    },
    openingBalance: {
        type: Number,
        default: 0
    },
    totalCashSales: {
        type: Number,
        default: 0
    },
    totalOnlineSales: {
        type: Number,
        default: 0
    },
    totalCreditSales: {
        type: Number,
        default: 0
    },
    totalCustomerPayments: {
        type: Number,
        default: 0
    },
    totalExpenses: {
        type: Number,
        default: 0
    },
    totalVendorPayments: {
        type: Number,
        default: 0
    },
    closingBalance: {
        type: Number,
        required: true
    },
    shop_id: {
        type: String,
        index: true
    },
    status: {
        type: String,
        enum: ['open', 'closed'],
        default: 'open'
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('DailyCashbook', dailyCashbookSchema);
