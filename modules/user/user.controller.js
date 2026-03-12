const userService = require('./user.service');
const loyaltyService = require('./loyalty.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { asyncHandler } = require('../../middlewares/error.middleware');
const { deleteFile } = require('../../middlewares/upload.middleware');

const getProfile = asyncHandler(async (req, res) => {
  const user = await userService.getUser(req.user._id);
  ApiResponse.success(user, 'Profile fetched successfully').send(res);
});

const updateProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user._id, req.body);
  ApiResponse.success(user, 'Profile updated successfully').send(res);
});

const uploadProfileImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('Please upload an image');
  }

  const user = await userService.uploadProfileImage(req.user._id, req.file.path);
  await deleteFile(req.file.path);

  ApiResponse.success(user, 'Profile image uploaded successfully').send(res);
});

const addAddress = asyncHandler(async (req, res) => {
  const user = await userService.addAddress(req.user._id, req.body);
  ApiResponse.created(user, 'Address added successfully').send(res);
});
const getAddresses = asyncHandler(async (req, res) => {
  const addresses = await userService.getAddresses(req.user._id);
  ApiResponse.success(addresses, 'Addresses fetched successfully').send(res);
});

const updateAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const user = await userService.updateAddress(req.user._id, addressId, req.body);
  ApiResponse.success(user, 'Address updated successfully').send(res);
});

const deleteAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const user = await userService.deleteAddress(req.user._id, addressId);
  ApiResponse.success(user, 'Address deleted successfully').send(res);
});

const getCart = asyncHandler(async (req, res) => {
  const cart = await userService.getCart(req.user._id);
  ApiResponse.success(cart, 'Cart fetched successfully').send(res);
});

const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body;
  const cart = await userService.addToCart(req.user._id, productId, quantity || 1);
  ApiResponse.success(cart, 'Item added to cart').send(res);
});

const updateCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;
  const cart = await userService.updateCartItem(req.user._id, productId, quantity);
  ApiResponse.success(cart, 'Cart updated').send(res);
});

const removeFromCart = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const cart = await userService.removeFromCart(req.user._id, productId);
  ApiResponse.success(cart, 'Item removed from cart').send(res);
});

const clearCart = asyncHandler(async (req, res) => {
  const cart = await userService.clearCart(req.user._id);
  ApiResponse.success(cart, 'Cart cleared').send(res);
});

const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await userService.getWishlist(req.user._id);
  ApiResponse.success(wishlist, 'Wishlist fetched successfully').send(res);
});

const addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  const wishlist = await userService.addToWishlist(req.user._id, productId);
  ApiResponse.success(wishlist, 'Added to wishlist').send(res);
});

const removeFromWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const wishlist = await userService.removeFromWishlist(req.user._id, productId);
  ApiResponse.success(wishlist, 'Removed from wishlist').send(res);
});
const clearWishlist = asyncHandler(async (req, res) => {
  const wishlist = await userService.clearWishlist(req.user._id);
  ApiResponse.success(wishlist, 'Wishlist cleared successfully').send(res);
});

const deleteAccount = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    throw ApiError.badRequest('Phone number and OTP are required for account deletion');
  }

  // Verify OTP
  const otpKey = `${CACHE_KEYS.OTP}${phone}`;
  const storedOTP = await cacheHelper.get(otpKey);

  if (!storedOTP || String(storedOTP) !== String(otp)) {
    throw ApiError.badRequest('Invalid or expired OTP');
  }

  // Delete OTP after verification
  await cacheHelper.del(otpKey);

  // Perform deletion
  await userService.deleteAccount(req.user._id);

  ApiResponse.success(null, 'Account deleted successfully').send(res);
});

const getLoyaltyInfo = async (req, res) => {
  const user = await userService.getLoyaltyInfo(req.user._id); // Changed from User.findById to userService.getLoyaltyInfo
  res.status(200).json({ success: true, data: user });
};

const redeemLoyaltyPoints = async (req, res) => {
  const { points } = req.body;
  if (!points || points <= 0) {
    throw ApiError.badRequest('Points to redeem are required');
  }
  const discountAmount = await loyaltyService.redeemPoints(req.user._id, points);
  res.status(200).json({
    success: true,
    message: `Redeemed ${points} points for ₹${discountAmount} discount`,
    data: { discountAmount }
  });
};

const updateFcmToken = asyncHandler(async (req, res) => {
  await userService.updateFcmToken(req.user._id, req.body.fcmToken);
  ApiResponse.success(null, 'FCM token updated successfully').send(res);
});

module.exports = {
  getProfile,
  updateProfile,
  uploadProfileImage,
  addAddress,
  updateAddress,
  deleteAddress,
  getCart,
  addToCart,
  getAddresses,
  updateCartItem,
  removeFromCart,
  clearCart,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  deleteAccount,
  getLoyaltyInfo,
  redeemLoyaltyPoints,
  updateFcmToken,
};