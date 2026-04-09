const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  contactPerson: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  address: {
    type: String
  },
  gstin: {
    type: String,
    trim: true,
    uppercase: true
  },
  metalSpecialization: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  // FINANCIALS / LEDGER
  outstandingBalance: {
    type: Number,
    default: 0, // Positive value means we owe the vendor money
    index: true
  },
  creditLimit: {
    type: Number,
    default: 1000000 // Total credit we can take from this vendor
  }
}, {
  timestamps: true
});

vendorSchema.index({ name: 'text', contactPerson: 'text', phone: 'text' });

const Vendor = mongoose.model('Vendor', vendorSchema);

module.exports = Vendor;
