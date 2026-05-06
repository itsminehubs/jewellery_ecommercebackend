const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['purchase', 'sale', 'adjustment', 'refund', 'removal'],
    required: true
  },
  action: {
    type: String, // e.g., 'PO_RECEIVED', 'ITEM_SOLD', 'STOCK_CORRECTION'
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  beforeQuantity: {
    type: Number,
    required: true
  },
  afterQuantity: {
    type: Number,
    required: true
  },
  quantityChanged: {
    type: Number,
    required: true
  },
  costImpact: {
    type: Number, // The price involved in the change
    default: 0
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId, // Could be PO ID or Order ID
    required: false
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  notes: String
}, {
  timestamps: true
});

auditLogSchema.index({ product: 1, createdAt: -1 });
auditLogSchema.index({ referenceId: 1 });
auditLogSchema.index({ type: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
