const mongoose = require('mongoose');
const { PRODUCT_CATEGORIES, METAL_TYPES, PRODUCT_STATUS } = require('../../utils/constants');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  description: { type: String, required: true },
  category: { type: String, required: true, enum: Object.values(PRODUCT_CATEGORIES), index: true },
  metalType: { type: String, required: true, enum: Object.values(METAL_TYPES) },
  purity: { type: String },
  weight: { type: Number, required: true },
  price: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0, max: 100 },
  finalPrice: { type: Number },
  stock: { type: Number, default: 0, min: 0 },
  images: [{ url: String, public_id: String }],
  specifications: { type: Map, of: String },
  status: { type: String, enum: Object.values(PRODUCT_STATUS), default: PRODUCT_STATUS.ACTIVE },
  views: { type: Number, default: 0 },
  sales: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  trending: { type: Boolean, default: false }
}, { timestamps: true });

productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ price: 1 });
productSchema.index({ finalPrice: 1 });
productSchema.index({ createdAt: -1 });

productSchema.pre('save', function () {
  if (this.isModified('price') || this.isModified('discount')) {
    this.finalPrice = this.price - (this.price * this.discount / 100);
  }
});


module.exports = mongoose.model('Product', productSchema);