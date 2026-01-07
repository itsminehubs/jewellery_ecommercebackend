const Product = require('./product.model');
const ApiError = require('../../utils/ApiError');
const { uploadMultipleImages, deleteImage } = require('../../config/cloudinary');
const { cacheHelper } = require('../../config');
const { CACHE_KEYS, PAGINATION } = require('../../utils/constants');
const logger = require('../../utils/logger');
const { PRODUCT_CATEGORIES } = require('../../utils/constants');

const getAllProducts = async (filters = {}, options = {}) => {
  const { page = 1, limit = 20, sort = '-createdAt', search } = options;
  const query = { status: 'active', ...filters };

  if (search) {
    query.$text = { $search: search };
  }

  const skip = (page - 1) * limit;
  const products = await Product.find(query).sort(sort).skip(skip).limit(limit);
  const total = await Product.countDocuments(query);

  return { products, total, page, limit };
};

const getProductById = async (productId) => {
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');
  
  product.views += 1;
  await product.save();
  
  return product;
};

const createProduct = async (productData, imagePaths = []) => {
  const images = imagePaths.length > 0 ? await uploadMultipleImages(imagePaths, 'products') : [];
  const product = new Product({ ...productData, images });
  await product.save();
  
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

  Object.assign(product, updateData);
  await product.save();
  
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

  // Delete product document
  await product.deleteOne();

  logger.info(`Product deleted: ${productId}`);
};
const getProductsByCategory = async (category, options = {}) => {
  const { page = 1, limit = 20, sort = '-createdAt', search, minPrice, maxPrice, metalType } = options;

  // ✅ Validate category
  if (!Object.values(PRODUCT_CATEGORIES).includes(category)) {
    throw ApiError.badRequest('Invalid product category');
  }

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
};