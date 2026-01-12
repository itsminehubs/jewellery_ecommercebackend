const User = require('./user.model');
const ApiError = require('../../utils/ApiError');
const { cacheHelper } = require('../../config');
const { CACHE_KEYS, CACHE_TTL } = require('../../utils/constants');
const { uploadImage, deleteImage } = require('../../config/cloudinary');
const logger = require('../../utils/logger');

const getUser = async (userId) => {
  const cachedUser = await cacheHelper.get(`${CACHE_KEYS.USER}${userId}`);
  if (cachedUser) {
    return typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser;
  }

  const user = await User.findById(userId).select('-refreshToken').populate('cart.product wishlist');
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  await cacheHelper.set(`${CACHE_KEYS.USER}${userId}`, JSON.stringify(user), CACHE_TTL.MEDIUM);
  return user;
};

const updateProfile = async (userId, updateData) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const allowedUpdates = ['name', 'email'];
  Object.keys(updateData).forEach(key => {
    if (allowedUpdates.includes(key)) {
      user[key] = updateData[key];
    }
  });

  await user.save();
  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
  
  logger.info(`Profile updated for user: ${userId}`);
  return user;
};

const uploadProfileImage = async (userId, filePath) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (user.profileImage && user.profileImage.public_id) {
    await deleteImage(user.profileImage.public_id);
  }

  const result = await uploadImage(filePath, 'profile-images');
  user.profileImage = { url: result.url, public_id: result.public_id };
  
  await user.save();
  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
  
  return user;
};

const addAddress = async (userId, addressData) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (addressData.isDefault) {
    user.addresses.forEach(addr => { addr.isDefault = false; });
  }

  user.addresses.push(addressData);
  await user.save();
  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
  
  return user;
};
const getAddresses = async (userId) => {
  const user = await User.findById(userId).select('addresses');
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user.addresses;
};

const updateAddress = async (userId, addressId, addressData) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const address = user.addresses.id(addressId);
  if (!address) {
    throw ApiError.notFound('Address not found');
  }

  if (addressData.isDefault) {
    user.addresses.forEach(addr => { addr.isDefault = false; });
  }

  Object.assign(address, addressData);
  await user.save();
  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
  
  return user;
};

const deleteAddress = async (userId, addressId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  user.addresses.id(addressId).remove();
  await user.save();
  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
  
  return user;
};

const getCart = async (userId) => {
  const user = await User.findById(userId).populate('cart.product');
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user.cart;
};

const addToCart = async (userId, productId, quantity) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  await user.addToCart(productId, quantity);
  await cacheHelper.del(`${CACHE_KEYS.CART}${userId}`);
  
  return user.cart;
};

const updateCartItem = async (userId, productId, quantity) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  await user.updateCartQuantity(productId, quantity);
  await cacheHelper.del(`${CACHE_KEYS.CART}${userId}`);
  
  return user.cart;
};

const removeFromCart = async (userId, productId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  await user.removeFromCart(productId);
  await cacheHelper.del(`${CACHE_KEYS.CART}${userId}`);
  
  return user.cart;
};

const clearCart = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  await user.clearCart();
  await cacheHelper.del(`${CACHE_KEYS.CART}${userId}`);
  
  return user.cart;
};

const getWishlist = async (userId) => {
  const user = await User.findById(userId).populate('wishlist');
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user.wishlist;
};

const addToWishlist = async (userId, productId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  await user.addToWishlist(productId);
  await cacheHelper.del(`${CACHE_KEYS.WISHLIST}${userId}`);
  
  return user.wishlist;
};

const removeFromWishlist = async (userId, productId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  await user.removeFromWishlist(productId);
  await cacheHelper.del(`${CACHE_KEYS.WISHLIST}${userId}`);
  
  return user.wishlist;
};
const clearWishlist = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  await user.clearWishlist();
  await cacheHelper.del(`${CACHE_KEYS.WISHLIST}${userId}`);

  return user.wishlist;
};

module.exports = {
  getUser,
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
  clearWishlist
};