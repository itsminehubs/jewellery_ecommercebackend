const mongoose = require('mongoose');
const { USER_ROLES } = require('../../utils/constants');
const { hashPassword, comparePassword } = require('../../utils/hash');

const addressSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['home', 'office', 'other'],
    default: 'home'
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  addressLine1: {
    type: String,
    required: true,
    trim: true
  },
  addressLine2: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  pincode: {
    type: String,
    required: true,
    trim: true
  },
  landmark: {
    type: String,
    trim: true
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, { _id: true });

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
  },
  name: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.USER
  },
  password: {
    type: String,
    select: false
  },
  profileImage: {
    url: String,
    public_id: String
  },
  addresses: [addressSchema],
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  cart: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  refreshToken: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  loyaltyPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  loyaltyTier: {
    type: String,
    enum: ['Silver', 'Gold', 'Platinum'],
    default: 'Silver'
  },
  fcmToken: {
    type: String,
    trim: true
  },
  dailyPointsEarned: {
    type: Number,
    default: 0
  },
  lastPointsUpdateDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.__v;
      delete ret.refreshToken;
      delete ret.loginAttempts;
      delete ret.lockUntil;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for cart total
userSchema.virtual('cartItemsCount').get(function () {
  return this.cart ? this.cart.length : 0;
});

// Virtual for wishlist count
userSchema.virtual('wishlistCount').get(function () {
  return this.wishlist ? this.wishlist.length : 0;
});

// Check if account is locked
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware
userSchema.pre('save', async function () {
  try {
    // Hash password if modified
    if (this.isModified('password') && this.password) {
      this.password = await hashPassword(this.password);
    }

    // Ensure only one default address
    if (this.isModified('addresses') && this.addresses.length > 0) {
      const defaultAddresses = this.addresses.filter(addr => addr.isDefault);

      if (defaultAddresses.length > 1) {
        // Keep only the last default, unset others
        this.addresses.forEach((addr, index) => {
          if (index < this.addresses.length - 1) {
            addr.isDefault = false;
          }
        });
      }
    }
  } catch (error) {
    console.error('Error in pre-save hook:', error);
    // Throw error so Mongoose save fails safely
    throw error;
  }
});
// Instance methods

/**
 * Add item to cart
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity
 * @returns {Promise<User>}
 */
userSchema.methods.addToCart = async function (productId, quantity = 1) {
  const existingItem = this.cart.find(
    item => item.product.toString() === productId.toString()
  );

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    this.cart.push({ product: productId, quantity });
  }

  return await this.save();
};

/**
 * Remove item from cart
 * @param {string} productId - Product ID
 * @returns {Promise<User>}
 */
userSchema.methods.removeFromCart = async function (productId) {
  this.cart = this.cart.filter(
    item => item.product.toString() !== productId.toString()
  );

  return await this.save();
};

/**
 * Update cart item quantity
 * @param {string} productId - Product ID
 * @param {number} quantity - New quantity
 * @returns {Promise<User>}
 */
userSchema.methods.updateCartQuantity = async function (productId, quantity) {
  const item = this.cart.find(
    item => item.product.toString() === productId.toString()
  );

  if (item) {
    if (quantity <= 0) {
      return await this.removeFromCart(productId);
    }
    item.quantity = quantity;
  }

  return await this.save();
};

/**
 * Clear cart
 * @returns {Promise<User>}
 */
userSchema.methods.clearCart = async function () {
  this.cart = [];
  return await this.save();
};

/**
 * Add to wishlist
 * @param {string} productId - Product ID
 * @returns {Promise<User>}
 */
userSchema.methods.addToWishlist = async function (productId) {
  if (!this.wishlist.includes(productId)) {
    this.wishlist.push(productId);
  }

  return await this.save();
};

/**
 * Remove from wishlist
 * @param {string} productId - Product ID
 * @returns {Promise<User>}
 */
userSchema.methods.removeFromWishlist = async function (productId) {
  this.wishlist = this.wishlist.filter(
    id => id.toString() !== productId.toString()
  );

  return await this.save();
};
/**
 * Check if password matches
 * @param {string} password - Password to check
 * @returns {Promise<boolean>}
 */
userSchema.methods.isPasswordMatch = async function (password) {
  return await comparePassword(password, this.password);
};

/**
 * Clear wishlist
 * @returns {Promise<User>}
 */
userSchema.methods.clearWishlist = async function () {
  this.wishlist = [];
  return await this.save();
};

/**
 * Increment login attempts
 * @returns {Promise<User>}
 */
userSchema.methods.incLoginAttempts = async function () {
  // Reset attempts if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return await this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours

  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }

  return await this.updateOne(updates);
};

/**
 * Reset login attempts
 * @returns {Promise<User>}
 */
userSchema.methods.resetLoginAttempts = async function () {
  return await this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

// Static methods

/**
 * Find user by phone
 * @param {string} phone - Phone number
 * @returns {Promise<User>}
 */
userSchema.statics.findByPhone = function (phone) {
  return this.findOne({ phone });
};

/**
 * Find user by email
 * @param {string} email - Email address
 * @returns {Promise<User>}
 */
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

const User = mongoose.model('User', userSchema);

module.exports = User;
