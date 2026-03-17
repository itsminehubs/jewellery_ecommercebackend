const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  issueDate: {
    type: Date,
    default: Date.now
  },
  dueDate: Date,
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    name: String,
    quantity: Number,
    price: Number,
    total: Number
  }],
  subtotal: Number,
  tax: Number,
  total: Number,
  status: {
    type: String,
    enum: ['draft', 'sent', 'paid', 'void'],
    default: 'draft'
  },
  metadata: {
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
