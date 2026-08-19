const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const { uploadMultipleImages, deleteImage } = require('../../config/s3');
const { cacheHelper } = require('../../config');
const { CACHE_KEYS } = require('../../utils/constants');
const logger = require('../../utils/logger');
const auditService = require('../audit/audit.service');
const inventoryService = require('./inventory.service');
const pricingService = require('./pricing.service');

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
    minDiscount,
    forHer,
    carbonsmithworld,
    status
  } = options;

  const where = { ...filters };

  if (status && status !== 'all') {
    where.status = status;
  } else if (Object.keys(filters).length === 0 && status !== 'all') {
    // Default to active for public store if no specific status or override filters are provided
    where.status = 'active';
  }

  if (sku) where.sku = sku;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } }
    ];
  }
  if (category) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(category);
    if (isUUID) {
      where.categoryId = category;
    } else {
      where.category = { slug: category };
    }
  }
  if (minPrice || maxPrice) {
    where.finalPrice = {};
    if (minPrice) where.finalPrice.gte = Number(minPrice);
    if (maxPrice) where.finalPrice.lte = Number(maxPrice);
  }

  if (metalType || purity) {
    where.metalDetails = {};
    if (metalType) {
      where.metalDetails.metalType = { in: metalType.split(',').map(m => m.trim()) };
    }
    if (purity) {
      where.metalDetails.purity = { in: purity.split(',').map(p => p.trim()) };
    }
  }

  if (gemstones) {
    where.stoneDetails = {
      some: {
        stoneType: { in: gemstones.split(',').map(g => g.trim()) }
      }
    };
  }

  // Note: Prisma schema does not currently have `basicDetails.occasion` (style) defined separately.
  // Assuming it might be stored in metadata or omitted for now.

  if (minDiscount) where.discount = { gte: Number(minDiscount) };
  if (forHer === 'true' || forHer === true) where.forHer = true;
  if (carbonsmithworld === 'true' || carbonsmithworld === true) where.carbonsmithworld = true;

  const skip = (page - 1) * limit;

  // Sorting translation
  let orderBy = { createdAt: 'desc' };
  if (sort === 'price') orderBy = { finalPrice: 'asc' };
  if (sort === '-price') orderBy = { finalPrice: 'desc' };
  if (sort === 'views') orderBy = { views: 'desc' };

  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take: Number(limit),
    include: {
      category: true,
      metalDetails: true,
      stoneDetails: true,
      images: true
    }
  });

  const total = await prisma.product.count({ where });

  return { products, total, page: Number(page), limit: Number(limit) };
};

const getProductById = async (productId) => {
  const cacheKey = `${CACHE_KEYS.PRODUCT_DETAIL}:${productId}`;
  const viewKey = `${CACHE_KEYS.PRODUCT_VIEWS}:${productId}`;

  // 1. Try Cache
  let productData = await cacheHelper.get(cacheKey);

  if (!productData) {
    // 2. Fetch from DB
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        metalDetails: true,
        stoneDetails: true,
        images: true
      }
    });

    if (!product) throw ApiError.notFound('Product not found');

    productData = product;
    // Cache for 10 minutes
    await cacheHelper.set(cacheKey, JSON.stringify(productData), 600);
  } else {
    productData = typeof productData === 'string' ? JSON.parse(productData) : productData;
  }

  // 3. Increment views in Redis (Buffered - flush to DB later)
  await cacheHelper.increment(viewKey);

  return productData;
};

const generateSkuAndTagId = async (productData) => {
  // Use product category or string parsing to generate CS-GEN-GOL-X-123456
  const categoryCode = 'GEN';
  const metalCode = productData.metalDetails?.metalType ? productData.metalDetails.metalType.substring(0, 3).toUpperCase() : 'GEN';
  const firstLetter = (productData.name || 'X').charAt(0).toUpperCase();

  const randomPartSku = Math.floor(100000 + Math.random() * 900000); // 6-digit random
  const sku = `CS-${categoryCode}-${metalCode}-${firstLetter}-${randomPartSku}`;

  const randomPartTag = Math.floor(100000 + Math.random() * 900000);
  const tagId = `CS-${categoryCode}-${metalCode}-${firstLetter}-${randomPartTag}`;

  return { sku, tagId };
};

const createProduct = async (productData, imagePaths = [], userId = null) => {
  const { sku, tagId } = await generateSkuAndTagId(productData);
  const finalSku = productData.sku || sku;
  const finalTagId = productData.tagId || tagId;

  // Extract nested models
  const { metalDetails, stoneDetails, category, ...baseProductData } = productData;

  // Run dynamic pricing engine before creation
  const pricingResults = await pricingService.calculateProductPrice(baseProductData, metalDetails, stoneDetails);

  const images = imagePaths.length > 0 ? await uploadMultipleImages(imagePaths, 'products') : [];

  // Safe Category Handling
  let resolvedCategoryId = category;
  if (category) {
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(category);
    if (!isValidUUID) {
      const foundCategory = await prisma.category.findFirst({
        where: {
          OR: [
            { name: { equals: category, mode: 'insensitive' } },
            { slug: { equals: category, mode: 'insensitive' } }
          ]
        }
      });
      if (foundCategory) {
        resolvedCategoryId = foundCategory.id;
      } else {
        throw require('../../utils/ApiError').badRequest(`Category '${category}' not found.`);
      }
    } else {
      // It is a UUID, but we should verify it exists
      const foundCategory = await prisma.category.findUnique({ where: { id: category } });
      if (!foundCategory) throw require('../../utils/ApiError').badRequest(`Category ID '${category}' not found.`);
    }
  }

  const initialStock = baseProductData.stock || 0;
  baseProductData.stock = 0; // Initialize as 0, let inventoryService handle it
  
  // Set initial status based on initial stock
  if (!baseProductData.status || baseProductData.status === 'active' || baseProductData.status === 'sold') {
    baseProductData.status = initialStock > 0 ? 'active' : 'sold';
  }

  const product = await prisma.product.create({
    data: {
      ...baseProductData,
      sku: finalSku,
      tagId: finalTagId,
      categoryId: resolvedCategoryId,
      price: pricingResults.price || 0,
      finalPrice: pricingResults.finalPrice || 0,
      metalDetails: metalDetails ? {
        create: pricingResults.metalDetails
      } : undefined,
      stoneDetails: stoneDetails && stoneDetails.length > 0 ? {
        create: pricingResults.stoneDetails.map(s => ({
          stoneType: s.stoneType,
          synthetic: s.synthetic,
          shape: s.shape,
          netWeight: s.netWeight || 0,
          color: s.color,
          clarity: s.clarity,
          carat: s.carat,
          cut: s.cut,
          certification: s.certification,
          rate: s.rate || 0
        }))
      } : undefined,
      images: images.length > 0 ? {
        create: images.map(img => ({
          url: img.url,
          publicId: img.public_id
        }))
      } : undefined
    },
    include: { metalDetails: true, stoneDetails: true, images: true }
  });

  // 📝 LOG AUDIT: Centralized Stock Arrival
  if (product.stock > 0) {
    await inventoryService.updateStock(product.id, product.stock, {
      type: 'purchase',
      action: 'INITIAL_STOCK',
      performedBy: userId,
      notes: 'Initial product stock entry'
    });
  }

  // Clear listing caches if exists
  await cacheHelper.delPattern(`${CACHE_KEYS.PRODUCT_DETAIL}:*`);

  logger.info(`Product created: ${product.id}`);
  return product;
};

const updateProduct = async (productId, updateData, imagePaths = [], imagesToDelete = [], userId = null) => {
  const existingProduct = await prisma.product.findUnique({
    where: { id: productId },
    include: { images: true, metalDetails: true, stoneDetails: true }
  });

  if (!existingProduct) throw ApiError.notFound('Product not found');

  // Handle image deletions
  if (imagesToDelete && imagesToDelete.length > 0) {
    for (const imageId of imagesToDelete) {
      const image = existingProduct.images.find(img => img.id === imageId || img.publicId === imageId);
      if (image && image.publicId) {
        try {
          await deleteImage(image.publicId);
          await prisma.productImage.delete({ where: { id: image.id } });
        } catch (error) {
          logger.warn(`Failed to delete image ${image.publicId} from Cloudinary`);
        }
      }
    }
  }

  let newImagesData = [];
  if (imagePaths.length > 0) {
    const newImages = await uploadMultipleImages(imagePaths, 'products');
    newImagesData = newImages.map(img => ({
      url: img.url,
      publicId: img.public_id
    }));
  }

  const { metalDetails, stoneDetails, category, ...baseProductData } = updateData;

  let resolvedCategoryId = category;
  if (category) {
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(category);
    if (!isValidUUID) {
      const foundCategory = await prisma.category.findFirst({
        where: {
          OR: [
            { name: { equals: category, mode: 'insensitive' } },
            { slug: { equals: category, mode: 'insensitive' } }
          ]
        }
      });
      if (foundCategory) {
        resolvedCategoryId = foundCategory.id;
      } else {
        throw require('../../utils/ApiError').badRequest(`Category '${category}' not found.`);
      }
    } else {
      const foundCategory = await prisma.category.findUnique({ where: { id: category } });
      if (!foundCategory) throw require('../../utils/ApiError').badRequest(`Category ID '${category}' not found.`);
    }
  }

  const mergedData = { ...existingProduct, ...baseProductData };
  const mergedMetalDetails = { ...existingProduct.metalDetails, ...metalDetails };
  const mergedStoneDetails = stoneDetails || existingProduct.stoneDetails; // Simplification

  // Re-run pricing engine
  const pricingResults = await pricingService.calculateProductPrice(mergedData, mergedMetalDetails, mergedStoneDetails);

  const beforeStock = existingProduct.stock;
  const newStock = updateData.stock !== undefined ? updateData.stock : beforeStock;
  
  if (baseProductData.stock !== undefined) {
      delete baseProductData.stock; // Let inventoryService handle the stock update
  }

  const updatedProduct = await prisma.product.update({
    where: { id: productId },
    data: {
      ...baseProductData,
      categoryId: resolvedCategoryId || undefined,
      price: pricingResults.price || existingProduct.price,
      finalPrice: pricingResults.finalPrice || existingProduct.finalPrice,
      images: newImagesData.length > 0 ? {
        create: newImagesData
      } : undefined,
      metalDetails: metalDetails ? {
        upsert: {
          create: (() => { const { id, productId, ...rest } = pricingResults.metalDetails || {}; return rest; })(),
          update: (() => { const { id, productId, ...rest } = pricingResults.metalDetails || {}; return rest; })()
        }
      } : undefined
      // For stone details, it's safer to delete and recreate if passed, or manage individually
    },
    include: { images: true, metalDetails: true, stoneDetails: true }
  });

  // 📝 LOG AUDIT: Centralized Adjustment
  if (beforeStock !== newStock) {
    await inventoryService.updateStock(updatedProduct.id, newStock - beforeStock, {
      type: 'adjustment',
      action: 'ADMIN_UPDATE',
      performedBy: userId,
      notes: 'Manual stock update from admin panel'
    });
  }

  // Clear caches: detail and listings
  await cacheHelper.del(`${CACHE_KEYS.PRODUCT_DETAIL}:${productId}`);
  await cacheHelper.delPattern(`${CACHE_KEYS.PRODUCT_DETAIL}:*`);

  return updatedProduct;
};

const deleteProduct = async (productId, userId = null) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { images: true }
  });
  if (!product) throw ApiError.notFound('Product not found');

  // Delete images from Cloudinary
  for (const image of product.images) {
    if (image.publicId) {
      await deleteImage(image.publicId);
    }
  }

  // 📝 LOG AUDIT: Stock Removal
  if (product.stock > 0) {
    await auditService.logStockChange({
      type: 'removal',
      action: 'delete',
      product: product.id,
      beforeQuantity: product.stock,
      afterQuantity: 0,
      quantityChanged: -product.stock,
      performedBy: userId,
      notes: 'Product deleted from system'
    });
  }

  // Delete product document
  await prisma.product.delete({ where: { id: productId } });

  // Clear caches: detail and listings
  await cacheHelper.del(`${CACHE_KEYS.PRODUCT_DETAIL}:${productId}`);
  await cacheHelper.delPattern(`${CACHE_KEYS.PRODUCT_DETAIL}:*`);

  logger.info(`Product deleted: ${productId}`);
};

const getProductByScannedCode = async (scannedCode) => {
  const product = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: scannedCode },
        { tagId: scannedCode },
        { huid: scannedCode }
      ]
    },
    include: { metalDetails: true, stoneDetails: true, images: true }
  });

  if (!product) {
    throw ApiError.notFound('Product not found with this barcode');
  }

  return product;
};

const getProductsByCategory = async (categoryIdOrSlug, options = {}) => {
  const { page = 1, limit = 20, sort = '-createdAt', search, minPrice, maxPrice, metalType } = options;

  // Attempt to resolve category ID if a slug was provided
  let resolvedCategoryId = categoryIdOrSlug;
  const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(categoryIdOrSlug);
  if (!isUUID) {
    const category = await prisma.category.findUnique({ where: { slug: categoryIdOrSlug } });
    if (category) {
      resolvedCategoryId = category.id;
    }
  }

  const where = {
    categoryId: resolvedCategoryId,
    status: 'active'
  };

  if (search) {
    where.OR = [
      { sku: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ];
  }

  if (minPrice || maxPrice) {
    where.finalPrice = {};
    if (minPrice) where.finalPrice.gte = Number(minPrice);
    if (maxPrice) where.finalPrice.lte = Number(maxPrice);
  }

  if (metalType) {
    where.metalDetails = {
      metalType: metalType
    };
  }

  const skip = (page - 1) * limit;

  let orderBy = { createdAt: 'desc' };
  if (sort === 'price') orderBy = { finalPrice: 'asc' };
  if (sort === '-price') orderBy = { finalPrice: 'desc' };

  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take: Number(limit),
    include: { images: true }
  });

  const total = await prisma.product.count({ where });

  return { products, total, page: Number(page), limit: Number(limit) };
};

const getFeaturedProducts = async (options = {}) => {
  const { page = 1, limit = 20, sort = '-createdAt' } = options;

  const where = {
    featured: true,
    status: 'active'
  };

  const skip = (page - 1) * limit;
  let orderBy = { createdAt: 'desc' };

  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take: Number(limit),
    include: { images: true }
  });

  const total = await prisma.product.count({ where });

  return { products, total, page: Number(page), limit: Number(limit) };
};

const getTrendingProducts = async (options = {}) => {
  const { page = 1, limit = 20, sort = '-views' } = options;

  const where = {
    trending: true,
    status: 'active'
  };

  const skip = (page - 1) * limit;
  let orderBy = { views: 'desc' };

  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take: Number(limit),
    include: { images: true }
  });

  const total = await prisma.product.count({ where });

  return { products, total, page: Number(page), limit: Number(limit) };
};

// Also expose pricing recalculators directly on product service since other modules expect them here
const recalculatePricesForMetal = pricingService.recalculatePricesForMetal;
const recalculatePricesForDiamond = pricingService.recalculatePricesForDiamond;

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductByScannedCode,
  getProductsByCategory,
  getFeaturedProducts,
  getTrendingProducts,
  recalculatePricesForMetal,
  recalculatePricesForDiamond
};
