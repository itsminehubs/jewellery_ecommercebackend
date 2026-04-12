const mongoose = require('mongoose');

const poItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  purchasePrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalPrice: {
    type: Number,
    required: true
  }
});

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  items: [poItemSchema],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['draft', 'ordered', 'received', 'cancelled'],
    default: 'draft'
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  receivedDate: {
    type: Date
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Auto-generate PO Number (e.g., PO-20240307-001)
purchaseOrderSchema.pre('validate', async function () {
  if (!this.poNumber) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await mongoose.model('PurchaseOrder').countDocuments({
      createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
    }) + 1;
    this.poNumber = `PO-${dateStr}-${count.toString().padStart(4, '0')}`;
  }
});

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

module.exports = PurchaseOrder;
