const mongoose = require('mongoose');
const { INVOICE_STATUS } = require('../../utils/constants');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  issueDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: true
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  taxAmount: {
    type: Number,
    required: true,
    min: 0
  },
  shippingAmount: {
    type: Number,
    required: true,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: Object.values(INVOICE_STATUS),
    default: INVOICE_STATUS.GENERATED,
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['paid', 'pending', 'failed', 'refunded'],
    default: 'pending'
  },
  filePath: {
    type: String,
    required: true
  },
  notes: {
    type: String,
    trim: true
  },
  metadata: {
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    generationTime: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      delete ret.filePath;
      return ret;
    }
  }
});

// Generate invoice number automatically BEFORE validation
invoiceSchema.pre('validate', async function () {
  if (this.isNew && !this.invoiceNumber) {
    const lastInvoice = await this.constructor
      .findOne({}, { invoiceNumber: 1 })
      .sort({ createdAt: -1 })
      .lean();

    let sequence = 1;

    if (lastInvoice?.invoiceNumber) {
      const match = lastInvoice.invoiceNumber.match(/INV-\d{6}-(\d+)/);
      if (match?.[1]) {
        sequence = parseInt(match[1]) + 1;
      }
    }

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const sequenceStr = String(sequence).padStart(4, '0');

    this.invoiceNumber = `INV-${year}${month}-${sequenceStr}`;

    if (!this.dueDate) {
      const due = new Date();
      due.setDate(due.getDate() + 30);
      this.dueDate = due;
    }
  }
});


// Virtual for invoice URL
invoiceSchema.virtual('downloadUrl').get(function() {
  return `/api/v1/invoices/${this._id}/download`;
});

// Static methods
invoiceSchema.statics.findByOrderId = function(orderId) {
  return this.findOne({ order: orderId });
};

invoiceSchema.statics.findByInvoiceNumber = function(invoiceNumber) {
  return this.findOne({ invoiceNumber });
};

// Add this helper method to ensure invoice number uniqueness
invoiceSchema.statics.generateUniqueInvoiceNumber = async function() {
  let isUnique = false;
  let invoiceNumber = '';
  let attempts = 0;
  
  while (!isUnique && attempts < 5) {
    attempts++;
    
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    invoiceNumber = `INV-${year}${month}-${random}`;
    
    const exists = await this.findOne({ invoiceNumber });
    if (!exists) {
      isUnique = true;
    }
  }
  
  if (!isUnique) {
    throw new Error('Failed to generate unique invoice number');
  }
  
  return invoiceNumber;
};

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;