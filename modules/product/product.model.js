const mongoose = require('mongoose');
const { PRODUCT_CATEGORIES, METAL_TYPES, PRODUCT_STATUS } = require('../../utils/constants');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  description: { type: String, required: true },
  category: { type: String, required: true, index: true },
  
  // METAL INFORMATION
  metalDetails: {
    metalType: { type: String, enum: Object.values(METAL_TYPES) },
    metalColor: { type: String }, // e.g., 'Yellow', 'White', 'Rose'
    purity: { type: String }, // e.g., '18K', '22K'
    grossWeight: { type: Number },
    netWeight: { type: Number },
  },

  // STONE / DIAMOND INFORMATION
  stoneDetails: [{
    stoneType: { type: String }, // e.g., 'Diamond', 'Ruby', 'None'
    synthetic: { type: Boolean, default: false },
    shape: { type: String, enum: ['Round', 'Pear', 'Marquis', 'Oval', 'Emerald', 'Cushion', 'Heart'] },
    netWeight: { type: Number },
    color: { type: String },
    clarity: { type: String },
    carat: { type: String },
    cut: { type: String },
    certification: { type: String },
  }],

  // BASIC INFORMATION
  basicDetails: {
    gender: { type: String }, // e.g., 'Women', 'Men', 'Unisex'
    brand: { type: String },
    occasion: { type: String },
  },

  // CATEGORY-SPECIFIC (Dynamic: Size, Length, Diameter)
  categoryAttributes: { type: Map, of: String },

  // UNIQUE ITEM TRACKING
  huid: { type: String, unique: true, sparse: true, index: true },
  tagId: { type: String, unique: true, sparse: true, index: true },
  certificationUrl: { type: String },
  
  // PRICING & STOCK
  price: { type: Number, min: 0 },
  purchasePrice: { type: Number, default: 0 },
  makingCharges: { type: Number, default: 0 },
  makingChargeType: { type: String, enum: ['fixed', 'per_gram'], default: 'per_gram' },
  stoneCharges: { type: Number, default: 0 },
  wastage: { type: Number, default: 0 }, // %
  discount: { type: Number, default: 0, min: 0, max: 100 },
  finalPrice: { type: Number },
  stock: { type: Number, default: 0 }, 
  status: { 
    type: String, 
    enum: Object.values(PRODUCT_STATUS), 
    default: PRODUCT_STATUS.ACTIVE 
  },
  
  images: [{ url: String, public_id: String }],
  specifications: { type: Map, of: String }, // Keep for any other custom fields
  
  // TAX & ORIGIN
  hsnCode: { type: String, default: '7113' },
  gstRate: { type: Number, default: 3 },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  shop_id: { type: String, index: true },

  rating: { type: Number, default: 0 },
  numReviews: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  sales: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  trending: { type: Boolean, default: false },
  sku: { type: String, unique: true, index: true },
}, { timestamps: true });

productSchema.index({ name: 'text', description: 'text', sku: 'text' });
productSchema.index({ price: 1 });
productSchema.index({ finalPrice: 1 });
productSchema.index({ createdAt: -1 });

// High-scale compound indexes
productSchema.index({ category: 1, status: 1, finalPrice: 1 });
productSchema.index({ trending: 1, status: 1 });
productSchema.index({ featured: 1, status: 1 });
productSchema.index({ shop_id: 1, createdAt: -1 });

productSchema.pre('save', async function () {
  // Update final price
  if (this.isModified('price') || this.isModified('discount')) {
    this.finalPrice = this.price - (this.price * this.discount / 100);
  }

  // Autogenerate SKU if not present (Mass-scale ready)
  if (!this.sku) {
    try {
      const categoryCode = (this.category || 'GEN').split('-')[0].split('_')[0].substring(0, 3).toUpperCase();
      const metalCode = (this.metalDetails?.metalType || 'GEN').substring(0, 3).toUpperCase();

      // Use YYYYMMDD + random 6-char entropy for 1M concurrent scale
      const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();

      this.sku = `${categoryCode}-${metalCode}-${datePart}-${randomPart}`;
    } catch (error) {
      throw error;
    }
  }
});


module.exports = mongoose.model('Product', productSchema);