const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const { cacheHelper } = require('../../config');
const { CACHE_KEYS, CACHE_TTL } = require('../../utils/constants');
const { uploadImage, deleteImage } = require('../../config/s3');
const logger = require('../../utils/logger');
const { hashPassword } = require('../../utils/hash');

const getUser = async (userId) => {
  const cachedUser = await cacheHelper.get(`${CACHE_KEYS.USER}${userId}`);
  if (cachedUser) {
    return typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      addresses: true,
      cartItems: { include: { product: true } },
      wishlist: { include: { product: true } }
    }
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const userJson = { ...user };
  delete userJson.password;
  delete userJson.refreshToken;

  await cacheHelper.set(`${CACHE_KEYS.USER}${userId}`, JSON.stringify(userJson), CACHE_TTL.MEDIUM);
  return userJson;
};

const getUserByPhone = async (phone) => {
  if (!phone) throw ApiError.badRequest('Phone number is required');
  const user = await prisma.user.findUnique({ 
    where: { phone },
    include: { addresses: true }
  });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Fetch recent purchases (up to 50 for complete POS history)
  const recentOrders = await prisma.pOSOrder.findMany({
    where: { customerId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      items: {
        include: { product: true }
      }
    }
  });

  const mappedOrders = recentOrders.map(order => ({
    ...order,
    items: order.items.map(item => ({
      ...item,
      name: item.product?.name || 'Item'
    }))
  }));

  const userJson = { ...user };
  delete userJson.password;
  delete userJson.refreshToken;

  return { ...userJson, recentOrders: mappedOrders };
};

const createQuickCustomer = async (customerData) => {
  const { name, phone, email, addresses } = customerData;
  if (!phone) throw ApiError.badRequest('Phone is required');

  const existingUser = await prisma.user.findUnique({ where: { phone } });
  if (existingUser) throw ApiError.badRequest('User with this phone already exists');

  // Random 12-char secure password for walk-in
  const randomPassword = Math.random().toString(36).slice(-12);
  const hashedPassword = await hashPassword(randomPassword);

  const addressData = addresses && addresses.length > 0 ? {
    create: addresses.map(addr => ({
      ...addr,
      type: addr.type || 'home',
      country: addr.country || 'India',
      isDefault: addr.isDefault || false
    }))
  } : undefined;

  const user = await prisma.user.create({
    data: {
      name: name || 'Walk-in Customer',
      phone,
      email,
      password: hashedPassword,
      role: 'user',
      isPhoneVerified: true, // Assumption for POS in-person
      addresses: addressData
    },
    include: { addresses: true }
  });

  const userJson = { ...user };
  delete userJson.password;
  delete userJson.refreshToken;

  return userJson;
};

const updateProfile = async (userId, updateData) => {
  const allowedUpdates = ['name', 'email'];
  const data = {};
  
  Object.keys(updateData).forEach(key => {
    if (allowedUpdates.includes(key)) {
      data[key] = updateData[key];
    }
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data
  });

  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
  logger.info(`Profile updated for user: ${userId}`);
  
  const userJson = { ...user };
  delete userJson.password;
  return userJson;
};

const uploadProfileImage = async (userId, filePath) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  if (user.profileImagePublicId) {
    await deleteImage(user.profileImagePublicId);
  }

  const result = await uploadImage(filePath, 'profile-images');
  
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      profileImageUrl: result.url,
      profileImagePublicId: result.public_id
    }
  });

  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
  
  const userJson = { ...updatedUser };
  delete userJson.password;
  return userJson;
};

const addAddress = async (userId, addressData) => {
  if (addressData.isDefault) {
    await prisma.address.updateMany({
      where: { userId },
      data: { isDefault: false }
    });
  }

  const address = await prisma.address.create({
    data: {
      ...addressData,
      userId
    }
  });

  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
  return address;
};

const getAddresses = async (userId) => {
  return await prisma.address.findMany({
    where: { userId }
  });
};

const updateAddress = async (userId, addressId, addressData) => {
  if (addressData.isDefault) {
    await prisma.address.updateMany({
      where: { userId },
      data: { isDefault: false }
    });
  }

  const address = await prisma.address.update({
    where: { id: addressId, userId },
    data: addressData
  });

  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
  return address;
};

const deleteAddress = async (userId, addressId) => {
  await prisma.address.delete({
    where: { id: addressId, userId }
  });

  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
  return { success: true };
};

const getCart = async (userId) => {
  const cartItems = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: true }
  });
  return cartItems;
};

const addToCart = async (userId, productId, quantity) => {
  const q = quantity || 1;
  
  await prisma.cartItem.upsert({
    where: {
      userId_productId: { userId, productId }
    },
    update: {
      quantity: { increment: q }
    },
    create: {
      userId,
      productId,
      quantity: q
    }
  });

  await cacheHelper.del(`${CACHE_KEYS.CART}${userId}`);
  return await getCart(userId);
};

const updateCartItem = async (userId, productId, quantity) => {
  if (quantity <= 0) {
    return removeFromCart(userId, productId);
  }

  await prisma.cartItem.update({
    where: {
      userId_productId: { userId, productId }
    },
    data: { quantity }
  });

  await cacheHelper.del(`${CACHE_KEYS.CART}${userId}`);
  return await getCart(userId);
};

const removeFromCart = async (userId, productId) => {
  await prisma.cartItem.delete({
    where: {
      userId_productId: { userId, productId }
    }
  }).catch(() => null); // Ignore if not found

  await cacheHelper.del(`${CACHE_KEYS.CART}${userId}`);
  return await getCart(userId);
};

const clearCart = async (userId) => {
  await prisma.cartItem.deleteMany({
    where: { userId }
  });

  await cacheHelper.del(`${CACHE_KEYS.CART}${userId}`);
  return [];
};

const getWishlist = async (userId) => {
  const items = await prisma.wishlistItem.findMany({
    where: { userId },
    include: { product: true }
  });
  return items;
};

const addToWishlist = async (userId, productId) => {
  await prisma.wishlistItem.upsert({
    where: {
      userId_productId: { userId, productId }
    },
    update: {},
    create: {
      userId,
      productId
    }
  });

  await cacheHelper.del(`${CACHE_KEYS.WISHLIST}${userId}`);
  return await getWishlist(userId);
};

const removeFromWishlist = async (userId, productId) => {
  await prisma.wishlistItem.delete({
    where: {
      userId_productId: { userId, productId }
    }
  }).catch(() => null);

  await cacheHelper.del(`${CACHE_KEYS.WISHLIST}${userId}`);
  return await getWishlist(userId);
};

const clearWishlist = async (userId) => {
  await prisma.wishlistItem.deleteMany({
    where: { userId }
  });

  await cacheHelper.del(`${CACHE_KEYS.WISHLIST}${userId}`);
  return [];
};

const deleteAccount = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  if (user.profileImagePublicId) {
    await deleteImage(user.profileImagePublicId);
  }

  // Soft delete to preserve order history
  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      deletedAt: new Date()
    }
  });
  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);

  logger.info(`Account deleted for user: ${userId}`);
  return { success: true };
};

const getLoyaltyInfo = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { loyaltyPoints: true, loyaltyTier: true }
  });
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

const updateFcmToken = async (userId, fcmToken) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { fcmToken }
  });
  
  await cacheHelper.del(`${CACHE_KEYS.USER}${userId}`);
  
  const userJson = { ...user };
  delete userJson.password;
  return userJson;
};

module.exports = {
  getUser,
  getUserByPhone,
  createQuickCustomer,
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
  updateFcmToken
};
