const mongoose = require('mongoose');

const customerLedgerSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['debit', 'credit'], // debit: customer owes more (sale), credit: customer pays (payment/return)
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
        enum: ['sale', 'payment', 'return', 'initial_balance', 'adjustment'],
        required: true
    },
    referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'referenceModel'
    },
    referenceModel: {
        type: String,
        enum: ['Order', 'POSOrder', 'ExchangeRecord']
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'online', 'card', 'exchange', 'check']
    },
    notes: String,
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

customerLedgerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CustomerLedger', customerLedgerSchema);
