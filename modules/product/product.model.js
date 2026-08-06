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
    shape: { type: String },
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
  carbonsmithworld: { type: Boolean, default: false },
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
productSchema.index({ carbonsmithworld: 1, status: 1 });
productSchema.index({ shop_id: 1, createdAt: -1 });
productSchema.index({ shop_id: 1, status: 1 }); // For Reports Stock Valuation

productSchema.pre('save', async function () {
  // Helpers
  const roundTo2 = (num) => Number((Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2));

  // --- DYNAMIC PRICING CALCULATION ---
  const grossWeight = this.metalDetails?.grossWeight || 0;

  // 1. Calculate Stone Weight and Value Dynamically
  let totalStoneWeight = 0;
  let dynamicStoneValue = 0;
  
  // Ensure DiamondRate model is available
  const DiamondRate = mongoose.models.DiamondRate || require('../diamond-rate/diamondRate.model');

  if (this.stoneDetails && this.stoneDetails.length > 0) {
    for (let stone of this.stoneDetails) {
      const stoneWeight = stone.netWeight || 0;
      totalStoneWeight += stoneWeight;
      
      let rate = stone.rate || 0;

      // Smart calculation for Diamond
      if (stone.stoneType === 'Diamond') {
        const query = {
          cut: stone.cut || 'All',
          color: stone.color || 'All',
          clarity: stone.clarity || 'All'
        };
        // Fallback matching to 'All' if exact match not found
        let diamondRateDoc = await DiamondRate.findOne(query).sort({ effectiveDate: -1, createdAt: -1 });
        if (!diamondRateDoc) {
          diamondRateDoc = await DiamondRate.findOne({ cut: 'All', color: 'All', clarity: 'All' }).sort({ effectiveDate: -1, createdAt: -1 });
        }
        if (diamondRateDoc) {
          rate = diamondRateDoc.ratePerCarat;
          stone.rate = rate; // Update the stone rate on the document so it's saved
        }
      }

      dynamicStoneValue += stoneWeight * rate;
    }
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
      const wastagePercent = this.wastage || 0;
      const wastageWeight = netWeight * (wastagePercent / 100);
      const finalGoldWeight = netWeight + wastageWeight;
      metalValue = roundTo2(finalGoldWeight * ratePerGram);
    }
  }

  // 5. Calculate Making Charges & Apply Discount
  let makingValue = 0;
  const makingCharges = this.makingCharges || 0;
  if (this.makingChargeType === 'per_gram') {
    makingValue = makingCharges * grossWeight;
  } else {
    makingValue = makingCharges; // Fixed
  }

  const discount = this.discount || 0;
  // ONLY makingValue gets discounted
  let discountedMakingValue = makingValue - (makingValue * (discount / 100));
  discountedMakingValue = roundTo2(discountedMakingValue);

  // 6. GST Split (3% Metal, 5% Making (on discounted), 0.25% Stones)
  const gst = roundTo2(
    (metalValue * 0.03) +
    (discountedMakingValue * 0.05) +
    (stoneValue * 0.0025)
  );

  // 7. Subtotal and Totals
  const subtotal = roundTo2(metalValue + discountedMakingValue + stoneValue);
  const totalCalculatedPrice = roundTo2(subtotal + gst);

  // 8. Update the base price and final price
  if (subtotal > 0) {
    // Price and finalPrice are now identical, discount was applied during makingValue calculation
    this.price = Math.round(totalCalculatedPrice); 
    this.finalPrice = Math.round(totalCalculatedPrice);
  }

  // Autogenerate SKU and tagId if not present
  if (!this.sku || !this.tagId) {
    const categoryCode = (this.category || 'GEN').split('-')[0].split('_')[0].substring(0, 3).toUpperCase();
    const metalCode = (this.metalDetails?.metalType || 'GEN').substring(0, 3).toUpperCase();
    const firstLetter = (this.name || 'X').charAt(0).toUpperCase();

    if (!this.sku) {
      const randomPartSku = Math.floor(100000 + Math.random() * 900000); // 6-digit random
      this.sku = `CS-${categoryCode}-${metalCode}-${firstLetter}-${randomPartSku}`;
    }

    if (!this.tagId) {
      // Ensure it's different from SKU just in case, but same format
      const randomPartTag = Math.floor(100000 + Math.random() * 900000);
      this.tagId = `CS-${categoryCode}-${metalCode}-${firstLetter}-${randomPartTag}`;
    }
  }
});


module.exports = mongoose.model('Product', productSchema);