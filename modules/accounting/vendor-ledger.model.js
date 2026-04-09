const mongoose = require('mongoose');

const vendorLedgerSchema = new mongoose.Schema({
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendor',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['debit', 'credit'], // debit: we pay vendor, credit: we receive stock from vendor
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    runningBalance: {
        type: Number,
        required: true
    },
    transactionType: {
        type: String,
        enum: ['purchase', 'payment', 'return', 'adjustment'],
        required: true
    },
    referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PurchaseOrder'
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'online', 'gold_exchange', 'bank_transfer']
    },
    notes: String,
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

vendorLedgerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('VendorLedger', vendorLedgerSchema);
