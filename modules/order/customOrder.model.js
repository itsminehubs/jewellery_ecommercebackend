const mongoose = require('mongoose');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../../utils/constants');

const customOrderSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Step 1: Choose Jewelry
  jewelryType: { 
    type: String, 
    required: true // e.g., "Ring", "Pendant", "Engagement Ring"
  },
  category: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category' 
  },

  // Step 2: Select Metal
  metalDetails: {
    metalType: { type: String }, // e.g., "Gold", "Platinum", "Silver"
    metalColor: { type: String }, // e.g., "Yellow", "White", "Rose"
    purity: { type: String }, // e.g., "14K", "18K", "950"
    estimatedWeight: { type: Number, default: 0 }, // in grams
    pricePerGram: { type: Number, default: 0 },
    metalCost: { type: Number, default: 0 }
  },

  // Step 3 & 4: Choose Stone & Diamond Configuration
  stoneDetails: {
    stoneType: { type: String }, // e.g., "Natural Diamond", "Lab Grown Diamond", "Sapphire"
    shape: { type: String }, // e.g., "Round", "Princess", "Oval"
    carat: { type: Number },
    color: { type: String }, // e.g., "D", "E", "F"
    clarity: { type: String }, // e.g., "VVS1", "VS1"
    cut: { type: String }, // e.g., "Excellent", "Very Good"
    polish: { type: String },
    symmetry: { type: String },
    fluorescence: { type: String },
    certification: { type: String }, // e.g., "GIA", "IGI"
    quantity: { type: Number, default: 1 },
    stoneCost: { type: Number, default: 0 }
  },

  // Step 5: Ring Size
  sizeDetails: {
    system: { type: String }, // e.g., "US", "UK", "EU", "India"
    sizeValue: { type: String }, // e.g., "6", "12", "M"
    priceModifier: { type: Number, default: 0 } // Extra cost for larger sizes
  },

  // Step 6: Personalization
  personalization: {
    engravingText: { type: String, maxlength: 50 },
    engravingFont: { type: String },
    engravingType: { type: String, enum: ['Laser', 'Hand', 'Inside', 'Outside', 'Hidden'] },
    referenceImage: { type: String }, // URL of uploaded handwriting/logo
    extraCost: { type: Number, default: 0 }
  },

  // 3D/2D Preview generated for this specific design
  designPreviewImages: [{ url: String, public_id: String }],

  // Cost Breakdown
  pricingBreakdown: {
    basePrice: { type: Number, default: 0 },
    totalMetalCost: { type: Number, default: 0 },
    totalStoneCost: { type: Number, default: 0 },
    makingCharges: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    gstRate: { type: Number, default: 3 }, // standard jewelry GST
    discountAmount: { type: Number, default: 0 },
    couponCode: { type: String },
    finalTotal: { type: Number, required: true }
  },

  // Checkout & Status Details
  status: { 
    type: String, 
    enum: ['Draft', 'Quote_Requested', 'Pending_Payment', 'Processing', 'In_Manufacturing', 'Ready_To_Ship', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Draft'
  },
  paymentStatus: { 
    type: String, 
    enum: Object.values(PAYMENT_STATUS), 
    default: PAYMENT_STATUS.PENDING 
  },
  paymentMethod: { type: String, default: 'razorpay' },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  
  shippingAddress: {
    name: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    country: String,
    pincode: String,
    landmark: String
  },
  
  adminNotes: { type: String }, // Notes by expert/admin after review
  customerNotes: { type: String }, // Specific request by customer
  
}, { timestamps: true });

// Indexes for superadmin panel querying
customOrderSchema.index({ user: 1, createdAt: -1 });
customOrderSchema.index({ status: 1 });
customOrderSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('CustomOrder', customOrderSchema);
