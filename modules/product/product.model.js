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
    rate: { type: Number, default: 0 }, // Rate per carat/gram for dynamic stone calculation
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
  forHer: { type: Boolean, default: false },
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
productSchema.index({ forHer: 1, status: 1 });
productSchema.index({ shop_id: 1, createdAt: -1 });

productSchema.pre('save', async function () {
  // Helpers
  const roundTo2 = (num) => Number((Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2));

  // --- DYNAMIC PRICING CALCULATION ---
  const grossWeight = this.metalDetails?.grossWeight || 0;

  // 1. Calculate Stone Weight and Value Dynamically
  let totalStoneWeight = 0;
  let dynamicStoneValue = 0;

  if (this.stoneDetails && this.stoneDetails.length > 0) {
    this.stoneDetails.forEach(stone => {
      const stoneWeight = stone.netWeight || 0;
      totalStoneWeight += stoneWeight;
      dynamicStoneValue += stoneWeight * (stone.rate || 0);
    });
  }

  // Fallback to flat stone charges if dynamic calculation returns 0
  const stoneValue = roundTo2(dynamicStoneValue > 0 ? dynamicStoneValue : (this.stoneCharges || 0));

  // 2. Net Gold Weight
  const netWeight = roundTo2(Math.max(0, grossWeight - totalStoneWeight));
  if (this.metalDetails) {
    this.metalDetails.netWeight = netWeight; // update the stored netWeight field
  }

  let metalValue = 0;
  let latestRate = null;

  // 3. Fetch latest rate if metal details are set
  if (this.metalDetails && this.metalDetails.metalType && this.metalDetails.purity) {
    const GoldRate = mongoose.model('GoldRate');
    latestRate = await GoldRate.findOne({
      metal: this.metalDetails.metalType.toLowerCase(),
      purity: this.metalDetails.purity
    }).sort({ effectiveDate: -1, createdAt: -1 });

    if (latestRate) {
      const ratePerGram = latestRate.ratePerGram;

      // 4. Wastage & Final Gold Weight Calculation
      const wastagePercent = this.wastage || 0;
      const wastageWeight = netWeight * (wastagePercent / 100);
      const finalGoldWeight = netWeight + wastageWeight;

      metalValue = roundTo2(finalGoldWeight * ratePerGram);
    }
  }

  // 5. Calculate Making Charges
  let makingValue = 0;
  const makingCharges = this.makingCharges || 0;
  if (this.makingChargeType === 'per_gram') {
    makingValue = roundTo2(makingCharges * grossWeight);
  } else {
    makingValue = roundTo2(makingCharges); // Fixed
  }

  // 6. GST Split (3% Metal, 5% Making, 0.25% Stones)
  const gst = roundTo2(
    (metalValue * 0.03) +
    (makingValue * 0.05) +
    (stoneValue * 0.0025)
  );

  // 7. Subtotal and Totals
  const subtotal = roundTo2(metalValue + makingValue + stoneValue);
  const totalCalculatedPrice = roundTo2(subtotal + gst);

  // 8. Update the base price if we have calculated values
  if (subtotal > 0) {
    this.price = Math.round(totalCalculatedPrice); // Keep standard integer rounding for billing if needed
  }

  // 9. Update final price based on discount
  if (this.price !== undefined) {
    const discount = this.discount || 0;
    this.finalPrice = Math.round(this.price - (this.price * (discount / 100)));
  }

  // Autogenerate SKU if not present (6 character high-entropy random part)
  if (!this.sku) {
    const categoryCode = (this.category || 'GEN').split('-')[0].split('_')[0].substring(0, 3).toUpperCase();
    const metalCode = (this.metalDetails?.metalType || 'GEN').substring(0, 3).toUpperCase();

    const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6-character entropy

    this.sku = `${categoryCode}-${metalCode}-${datePart}-${randomPart}`;
  }
});


module.exports = mongoose.model('Product', productSchema);