const mongoose = require('mongoose');

const posOrderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    sku: String,
    name: String,
    metalType: String,
    purity: String,
    grossWeight: Number,
    netWeight: Number,
    stoneWeight: Number,
    goldRateAtTime: Number,
    makingCharge: Number,
    stoneCharge: Number,
    gstAmount: Number,
    totalAmount: Number,
    quantity: { type: Number, default: 1 }
});

const posOrderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    shop_id: {
        type: String,
        required: true,
        index: true
    },
    customer: {
        name: String,
        phone: String,
        email: String,
        address: String
    },
    items: [posOrderItemSchema],
    subTotal: Number,
    totalGST: Number,
    grandTotal: Number,

    // Payment Details
    payments: [{
        method: {
            type: String,
            enum: ['cash', 'card', 'upi', 'bank_transfer', 'exchange'],
            required: true
        },
        amount: { type: Number, required: true },
        transactionId: String, // For card/UPI
        notes: String
    }],

    // Exchange Details (if any)
    exchangeItems: [{
        description: String,
        grossWeight: Number,
        netWeight: Number,
        purity: String,
        rateCalculated: Number,
        totalValue: Number
    }],

    status: {
        type: String,
        enum: ['completed', 'cancelled', 'refunded'],
        default: 'completed'
    },
    billedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    notes: String
}, {
    timestamps: true
});

// Auto-generate a professional Order ID (e.g., POS-SHOP01-20240307-001)
posOrderSchema.pre('save', async function (next) {
    if (!this.orderId) {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await mongoose.model('POSOrder').countDocuments({
            shop_id: this.shop_id,
            createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
        }) + 1;
        this.orderId = `POS-${this.shop_id}-${dateStr}-${count.toString().padStart(4, '0')}`;
    }
    next();
});

const POSOrder = mongoose.model('POSOrder', posOrderSchema);

module.exports = POSOrder;
