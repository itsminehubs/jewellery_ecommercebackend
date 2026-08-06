const mongoose = require('mongoose');

const schemeInstallmentSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    method: {
        type: String,
        enum: ['cash', 'card', 'upi', 'bank_transfer'],
        required: true
    },
    transactionId: String,
    notes: String,
    collectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});

const schemeSchema = new mongoose.Schema({
    schemeId: {
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
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    startDate: { type: Date, default: Date.now },
    maturityDate: { type: Date, required: true },
    
    // Core Financials
    monthlyInstallment: { type: Number, required: true },
    totalMonths: { type: Number, default: 11 },
    bonusPercentage: { type: Number, default: 100 }, // E.g., 100% of one installment at maturity
    
    // Tracking
    installments: [schemeInstallmentSchema],
    totalPaid: { type: Number, default: 0 },
    
    status: {
        type: String,
        enum: ['active', 'matured', 'redeemed', 'closed'],
        default: 'active'
    },

    // Redemption info
    redemptionOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'POSOrder' },
    redemptionDate: Date,
    redemptionValue: Number, // totalPaid + bonus

    notes: String
}, {
    timestamps: true
});

// Auto-generate Scheme ID
schemeSchema.pre('save', async function () {
    if (!this.schemeId) {
        const dateStr = new Date().toISOString().slice(0, 7).replace(/-/g, ''); // YYYYMM
        const count = await mongoose.model('Scheme').countDocuments({
            shop_id: this.shop_id,
            createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
        }) + 1;
        this.schemeId = `SCH-${this.shop_id}-${dateStr}-${count.toString().padStart(4, '0')}`;
    }
    
    // Auto-update status to matured if they've paid all installments
    if (this.status === 'active' && this.installments.length >= this.totalMonths) {
        this.status = 'matured';
    }
});

const Scheme = mongoose.model('Scheme', schemeSchema);
module.exports = Scheme;
