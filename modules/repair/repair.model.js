const mongoose = require('mongoose');

const repairItemSchema = new mongoose.Schema({
    article: { type: String, required: true },
    purity: { type: String }, // e.g. 18K
    fineness: { type: Number }, // e.g. 75.0
    pieces: { type: Number, default: 1 },
    grossWeight: { type: Number, default: 0 },
    stoneWeight: { type: Number, default: 0 },
    diamondWeight: { type: Number, default: 0 },
    netWeight: { type: Number, default: 0 },
    jobDetails: { type: String, required: true } // e.g. hook soldering
});

const repairSchema = new mongoose.Schema({
    receiptVoucher: { type: String, unique: true, required: true },
    repairBagNumber: { type: String },
    
    // Customer who owns the repair
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Intake details
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    billedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // Repair Items
    items: [repairItemSchema],
    
    // Dates & Status
    deliveryDate: { type: Date },
    status: { 
        type: String, 
        enum: ['pending', 'in-progress', 'ready', 'delivered'], 
        default: 'pending' 
    },
    
    remarks: { type: String }
}, {
    timestamps: true
});

module.exports = mongoose.model('Repair', repairSchema);
