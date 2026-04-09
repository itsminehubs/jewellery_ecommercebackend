const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        enum: ['rent', 'salary', 'electricity', 'marketing', 'maintenance', 'inventory_packaging', 'others'],
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    description: String,
    date: {
        type: Date,
        default: Date.now,
        index: true
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'online', 'card'],
        default: 'cash'
    },
    shop_id: {
        type: String, // For multi-branch expense tracking
        index: true
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Expense', expenseSchema);
