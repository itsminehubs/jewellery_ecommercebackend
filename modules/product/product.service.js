const Product = require('./product.model');
const ApiError = require('../../utils/ApiError');
const { uploadMultipleImages, deleteImage } = require('../../config/cloudinary');
const { cacheHelper } = require('../../config');
const { CACHE_KEYS, PAGINATION } = require('../../utils/constants');
const logger = require('../../utils/logger');
const { PRODUCT_CATEGORIES } = require('../../utils/constants');
const auditService = require('../audit/audit.service');

const getAllProducts = async (filters = {}, options = {}) => {
  const { 
    page = 1, 
    limit = 20, 
    sort = '-createdAt', 
    search, 
    sku,
    category,
    minPrice,
    maxPrice,
    metalType,
    purity,
    gemstones,
    style,
    minDiscount
  } = options;
  
  const query = { status: 'active', ...filters };

  if (sku) query.sku = sku;
  if (search) query.$text = { $search: search };
  if (category) query.category = category;
  
  if (minPrice || maxPrice) {
    query.finalPrice = {};
    if (minPrice) query.finalPrice.$gte = Number(minPrice);
    if (maxPrice) query.finalPrice.$lte = Number(maxPrice);
  }

  if (metalType) query.metalType = metalType;
  if (purity) query.purity = purity;
  if (gemstones) query.gemstones = gemstones;
  if (style) query.style = style;
  if (minDiscount) query.discount = { $gte: Number(minDiscount) };

  const skip = (page - 1) * limit;
  const products = await Product.find(query).sort(sort).skip(skip).limit(Number(limit));
  const total = await Product.countDocuments(query);

  return { products, total, page: Number(page), limit: Number(limit) };
};

const getProductById = async (productId) => {
  const cacheKey = `${CACHE_KEYS.PRODUCT_DETAIL}:${productId}`;
  const viewKey = `${CACHE_KEYS.PRODUCT_VIEWS}:${productId}`;

  // 1. Try Cache
  let productData = await cacheHelper.get(cacheKey);

  if (!productData) {
    // 2. Fetch from DB
    const product = await Product.findById(productId);
    if (!product) throw ApiError.notFound('Product not found');

    productData = product.toObject();
    // Cache for 10 minutes
    await cacheHelper.set(cacheKey, productData, 600);
  }

  // 3. Increment views in Redis (Buffered - flush to DB later)
  await cacheHelper.increment(viewKey);

  return productData;
};

const createProduct = async (productData, imagePaths = []) => {
  const images = imagePaths.length > 0 ? await uploadMultipleImages(imagePaths, 'products') : [];
  const product = new Product({ ...productData, images });
  await product.save();

  // 📝 LOG AUDIT: Centralized Stock Arrival
  await inventoryService.updateStock(product._id, product.stock, {
    type: 'purchase',
    action: 'INITIAL_STOCK',
    notes: 'Initial product stock entry'
  });

  // Clear listing caches if exists
  await cacheHelper.delPattern(`${CACHE_KEYS.PRODUCT_DETAIL}:*`);

  logger.info(`Product created: ${product._id}`);
  return product;
};

const updateProduct = async (productId, updateData, imagePaths = []) => {
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  if (imagePaths.length > 0) {
    const newImages = await uploadMultipleImages(imagePaths, 'products');
    product.images.push(...newImages);
  }

  const beforeStock = product.stock;
  const newStock = updateData.stock !== undefined ? updateData.stock : beforeStock;
  
  Object.assign(product, updateData);
  await product.save();

  // 📝 LOG AUDIT: Centralized Adjustment
  if (beforeStock !== newStock) {
    await inventoryService.updateStock(product._id, newStock - beforeStock, {
      type: 'adjustment',
      action: 'ADMIN_UPDATE',
      notes: 'Manual stock update from admin panel'
    });
  }

  // Clear caches: detail and listings
  await cacheHelper.del(`${CACHE_KEYS.PRODUCT_DETAIL}:${productId}`);
  await cacheHelper.delPattern(`${CACHE_KEYS.PRODUCT_DETAIL}:*`); // Clear listings/results

  return product;
};

const deleteProduct = async (productId) => {
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  // Delete images from Cloudinary
  for (const image of product.images) {
    if (image.public_id) {
      await deleteImage(image.public_id);
    }
  }

  // 📝 LOG AUDIT: Stock Removal
  await auditService.logStockChange({
    type: 'removal',
    action: 'delete',
    product: product._id,
    beforeQuantity: product.stock,
    afterQuantity: 0,
    quantityChanged: -product.stock,
    notes: 'Product deleted from system'
  });

  // Delete product document
  await product.deleteOne();

  // Clear caches: detail and listings
  await cacheHelper.del(`${CACHE_KEYS.PRODUCT_DETAIL}:${productId}`);
  await cacheHelper.delPattern(`${CACHE_KEYS.PRODUCT_DETAIL}:*`);

  logger.info(`Product deleted: ${productId}`);
};

const getProductBySku = async (sku) => {
  const product = await Product.findOne({ sku });
  if (!product) throw ApiError.notFound('Product not found with this SKU');
  return product;
};
const getProductsByCategory = async (category, options = {}) => {
  const { page = 1, limit = 20, sort = '-createdAt', search, minPrice, maxPrice, metalType } = options;

  // ✅ Validation removed for dynamic categories

  const query = {
    category,
    status: 'active'
  };

  // 🔍 Text search
  if (search) {
    query.$text = { $search: search };
  }

  // 💰 Price filter
  if (minPrice || maxPrice) {
    query.finalPrice = {};
    if (minPrice) query.finalPrice.$gte = Number(minPrice);
    if (maxPrice) query.finalPrice.$lte = Number(maxPrice);
  }

  // 🪙 Metal type filter
  if (metalType) {
    query.metalType = metalType;
  }

  const skip = (page - 1) * limit;

  const products = await Product.find(query)
    .sort(sort)
    .skip(skip)
    .limit(Number(limit));

  const total = await Product.countDocuments(query);

  return {
    products,
    total,
    page: Number(page),
    limit: Number(limit)
  };
};
const getFeaturedProducts = async (options = {}) => {
  const { page = 1, limit = 20, sort = '-createdAt' } = options;

  const query = {
    featured: true,
    status: 'active'
  };

  const skip = (page - 1) * limit;

  const products = await Product.find(query)
    .sort(sort)
    .skip(skip)
    .limit(Number(limit));

  const total = await Product.countDocuments(query);

  return { products, total, page: Number(page), limit: Number(limit) };
};

const getTrendingProducts = async (options = {}) => {
  const { page = 1, limit = 20, sort = '-views' } = options;

  const query = {
    trending: true,
    status: 'active'
  };

  const skip = (page - 1) * limit;

  const products = await Product.find(query)
    .sort(sort)
    .skip(skip)
    .limit(Number(limit));

  const total = await Product.countDocuments(query);

  return { products, total, page: Number(page), limit: Number(limit) };
};
module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  getFeaturedProducts,
  getTrendingProducts,
  getProductBySku
};