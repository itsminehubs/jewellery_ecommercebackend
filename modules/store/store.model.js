const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Store name is required'],
        trim: true,
    },
    shop_id: {
        type: String,
        required: [true, 'Shop ID is required'],
        unique: true,
        trim: true,
        index: true
    },
    address: {
        type: String,
        required: [true, 'Store address is required'],
    },
    city: {
        type: String,
        required: [true, 'City is required'],
    },
    state: {
        type: String,
        required: [true, 'State is required'],
    },
    pincode: {
        type: String,
        required: [true, 'Pincode is required'],
    },
    phone: {
        type: String,
        required: [true, 'Store phone number is required'],
    },
    email: {
        type: String,
        trim: true,
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
    },
    metadata: {
        type: Map,
        of: String
    }
}, {
    timestamps: true,
});

const Store = mongoose.model('Store', storeSchema);

module.exports = Store;
