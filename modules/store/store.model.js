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

storeSchema.pre('validate', function(next) {
    if (!this.shop_id && this.name && this.city) {
        const baseName = this.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        const baseCity = this.city.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        const uniqueSuffix = Math.floor(1000 + Math.random() * 9000); // 4 digit random number
        this.shop_id = `${baseName}-${baseCity}-${uniqueSuffix}`.replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
    next();
});

const Store = mongoose.model('Store', storeSchema);

module.exports = Store;
