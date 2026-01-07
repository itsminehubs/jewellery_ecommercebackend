const mongoose = require('mongoose');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../../utils/constants');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
  name: String,
  image: String
});

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [orderItemSchema],
  shippingAddress: {
    name: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String
  },
  subtotal: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  shippingCost: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  paymentMethod: { type: String, default: 'razorpay' },
  paymentStatus: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.PENDING },
  statusHistory: [{ status: String, timestamp: { type: Date, default: Date.now }, note: String }],
  notes: String,
  cancelReason: String,
  deliveredAt: Date
}, { timestamps: true });

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

module.exports = mongoose.model('Order', orderSchema);