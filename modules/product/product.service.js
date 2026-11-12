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
    status,
    stockStatus,
    exclude,
    productType,
    featured,
    trending,
    makeForOrder
  } = options;

  const where = { ...filters, deletedAt: null };

  if (exclude) {
    where.id = { not: exclude };
  }

  // Stock status filter (in_stock, low_stock, out_of_stock)
  if (stockStatus && stockStatus !== 'all') {
    if (stockStatus === 'in_stock') {
      where.stock = { gt: 0 };
    } else if (stockStatus === 'low_stock') {
      where.stock = { gt: 0, lte: 2 };
    } else if (stockStatus === 'out_of_stock') {
      where.stock = 0;
    }
  }

  if (status === 'in_repair') {
    where.internalState = 'IN_REPAIR';
  } else if (status === 'out_of_stock') {
    where.status = { in: ['out_of_stock', 'sold'] };
  } else if (status === 'all') {
    // Show all product statuses (used by Admin)
  } else if (status) {
    where.status = status;
  } else if (Object.keys(filters).length === 0) {
    // Default to active, out_of_stock, and sold for public store
    where.status = { in: ['active', 'out_of_stock', 'sold'] };
  }

  if (sku) where.sku = typeof sku === 'string' ? sku.trim() : sku;
  if (search) {
    const cleanSearch = typeof search === 'string' ? search.trim() : search;
    if (cleanSearch) {
      where.OR = [
        { name: { contains: cleanSearch, mode: 'insensitive' } },
        { description: { contains: cleanSearch, mode: 'insensitive' } },
        { sku: { contains: cleanSearch, mode: 'insensitive' } },
        { huid: { contains: cleanSearch, mode: 'insensitive' } },
        { tagId: { contains: cleanSearch, mode: 'insensitive' } }
      ];
    }
  }
  if (category && category !== 'all') {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(category);
    if (isUUID) {
      where.categoryId = category;
    } else {
      where.category = {
        OR: [
          { slug: { equals: category, mode: 'insensitive' } },
          { parent: { slug: { equals: category, mode: 'insensitive' } } }
        ]
      };
    }
  }
  if (minPrice || maxPrice) {
    where.finalPrice = {};
    if (minPrice) where.finalPrice.gte = Number(minPrice);
    if (maxPrice) where.finalPrice.lte = Number(maxPrice);
  }

  // Material & Stone Filter (Diamond = Gold + Diamond with price & details, Gold = Plain Gold only, Silver = Plain Silver only)
  if (metalType && metalType !== 'all') {
    const mtLower = metalType.trim().toLowerCase();

    if (mtLower === 'diamond' || mtLower === 'gold_diamond') {
      // Diamond: Gold base with Diamond stones that have diamond price/rate and diamond details
      where.metalDetails = {
        metalType: { in: ['gold', 'Gold', 'GOLD', 'rose_gold', 'white_gold', 'two_tone'] }
      };
      where.stoneDetails = {
        some: {
          stoneType: { equals: 'diamond', mode: 'insensitive' },
          OR: [
            { rate: { gt: 0 } },
            { carat: { not: null } },
            { netWeight: { gt: 0 } }
          ]
        }
      };
    } else if (mtLower === 'gold' || mtLower === 'plain_gold') {
      // Gold: Plain Gold with zero diamonds
      where.metalDetails = {
        metalType: { in: ['gold', 'Gold', 'GOLD', 'rose_gold', 'white_gold', 'two_tone'] }
      };
      where.stoneDetails = {
        none: {
          stoneType: { equals: 'diamond', mode: 'insensitive' }
        }
      };
    } else if (mtLower === 'silver') {
      // Silver: Plain Silver with zero diamonds
      where.metalDetails = {
        metalType: { in: ['silver', 'Silver', 'SILVER'] }
      };
      where.stoneDetails = {
        none: {
          stoneType: { equals: 'diamond', mode: 'insensitive' }
        }
      };
    } else {
      where.metalDetails = {
        metalType: { equals: metalType, mode: 'insensitive' }
      };
    }
  }

  if (purity) {
    if (!where.metalDetails) where.metalDetails = {};
    where.metalDetails.purity = { in: purity.split(',').map(p => p.trim()) };
  }

  if (productType) {
    const types = productType.split(',').map(t => t.trim().toLowerCase());
    const conditions = [];

    // Filter to identify genuine diamond stones that have Color, Clarity, Cut, and/or diamond rate
    const diamondStoneFilter = {
      AND: [
        { rate: { gt: 0 } },
        {
          OR: [
            {
              AND: [
                { stoneType: { equals: 'Diamond', mode: 'insensitive' } },
                {
                  OR: [
                    { clarity: { not: null, not: '' } },
                    { cut: { not: null, not: '' } },
                    { color: { not: null, not: '' } }
                  ]
                }
              ]
            },
            {
              AND: [
                { color: { not: null, not: '' } },
                { clarity: { not: null, not: '' } },
                { cut: { not: null, not: '' } }
              ]
            }
          ]
        }
      ]
    };

    if (types.includes('diamond')) {
      conditions.push({
        metalDetails: { metalType: { in: ['Gold', 'gold', 'Platinum', 'platinum'] } },
        stoneDetails: { some: diamondStoneFilter }
      });
    }
    if (types.includes('gold')) {
      conditions.push({
        metalDetails: { metalType: { in: ['Gold', 'gold'] } },
        stoneDetails: { none: diamondStoneFilter } // Plain gold OR gold with other stones (no diamond 4Cs)
      });
    }
    if (types.includes('silver')) {
      conditions.push({
        metalDetails: { metalType: { in: ['Silver', 'silver'] } }
      });
    }

    if (conditions.length > 0) {
      where.AND = [...(where.AND || []), { OR: conditions }];
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
  if (featured === 'true' || featured === true) where.featured = true;
  if (trending === 'true' || trending === true) where.trending = true;

  if (carbonsmithworld === 'true' || carbonsmithworld === true) {
    where.carbonsmithworld = true;
  } else if (carbonsmithworld === 'all') {
    // Show all products, do not filter by carbonsmithworld
  } else {
    // Hide carbonsmithworld products from regular store queries by default
    where.carbonsmithworld = false;
  }

  if (makeForOrder === 'true' || makeForOrder === true) {
    where.makeForOrder = true;
  } else if (makeForOrder === 'all') {
    // Show all products, do not filter by makeForOrder (used by Admin and POS)
  } else {
    // Hide makeForOrder products from public store/app queries by default
    where.makeForOrder = false;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(10000, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  // Sorting translation
  let primarySort = { createdAt: 'desc' };
  if (sort === '-createdAt' || sort === 'newest') primarySort = { createdAt: 'desc' };
  if (sort === 'createdAt') primarySort = { createdAt: 'asc' };
  if (sort === 'price' || sort === 'price-asc') primarySort = { finalPrice: 'asc' };
  if (sort === '-price' || sort === 'price-desc') primarySort = { finalPrice: 'desc' };
  if (sort === '-views' || sort === 'views' || sort === 'popularity') primarySort = { views: 'desc' };
  if (sort === 'rating') primarySort = { rating: 'desc' };
  if (sort === 'discount') primarySort = { discount: 'desc' };
  if (sort === 'recommended') primarySort = { featured: 'desc' };

  // If no single productType is specified or 'all' is passed on public storefront, prioritize diamond above gold
  let orderBy = [primarySort];
  const isAdminOrPos = carbonsmithworld === 'all' || makeForOrder === 'all';
  if (!isAdminOrPos && (!productType || productType === 'all' || (productType.includes('diamond') && productType.includes('gold')))) {
    orderBy = [{ stoneDetails: { _count: 'desc' } }, primarySort];
  }

  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take: limitNum,
    include: {
      category: true,
      metalDetails: true,
      stoneDetails: true,
      images: true
    }
  });

  const total = await prisma.product.count({ where });

  return { products, total, page: pageNum, limit: limitNum };
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

  if (baseProductData.makeForOrder !== undefined) {
    baseProductData.makeForOrder = String(baseProductData.makeForOrder) === 'true';
  }

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

  // Normalize unique fields to prevent Prisma constraint errors on empty strings
  if (baseProductData.huid === "") baseProductData.huid = null;
  delete baseProductData.isManualPrice;
  delete baseProductData.isPriceManual;

  // Handle specifications (embed into categoryAttributes since it is not a direct Prisma column)
  if (baseProductData.specifications !== undefined) {
    if (baseProductData.specifications && typeof baseProductData.specifications === 'object' && Object.keys(baseProductData.specifications).length > 0) {
      baseProductData.categoryAttributes = {
        ...(baseProductData.categoryAttributes || {}),
        specifications: baseProductData.specifications
      };
    }
    delete baseProductData.specifications;
  }

  // Set initial status based on initial stock
  if (!baseProductData.status || baseProductData.status === 'active' || baseProductData.status === 'out_of_stock' || baseProductData.status === 'sold') {
    baseProductData.status = initialStock > 0 ? 'active' : 'out_of_stock';
  }

  let product;
  try {
    product = await prisma.product.create({
      data: {
        ...baseProductData,
        sku: finalSku,
        tagId: finalTagId,
        categoryId: resolvedCategoryId,
        price: pricingResults.price || 0,
        finalPrice: pricingResults.finalPrice || 0,
        makingCharges: (pricingResults.makingCharges !== undefined && baseProductData.makingPercentage && Number(baseProductData.makingPercentage) > 0)
          ? pricingResults.makingCharges
          : (baseProductData.makingCharges || 0),
        metalDetails: metalDetails ? {
          create: pricingResults.metalDetails
        } : undefined,
        stoneDetails: stoneDetails && stoneDetails.length > 0 ? {
          create: pricingResults.stoneDetails.map(s => ({
            stoneType: s.stoneType || 'Other',
            synthetic: Boolean(s.synthetic),
            shape: s.shape || null,
            netWeight: (s.netWeight !== undefined && s.netWeight !== null && String(s.netWeight).trim() !== '') ? Number(s.netWeight) : 0,
            color: s.color || null,
            clarity: s.clarity || null,
            carat: s.carat ? String(s.carat) : null,
            cut: s.cut || null,
            certification: s.certification || null,
            rate: (s.rate !== undefined && s.rate !== null && String(s.rate).trim() !== '') ? Number(s.rate) : 0
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
  } catch (error) {
    if (error.code === 'P2002') {
      const target = error.meta?.target || [];
      const field = target[0] || 'unique field';
      throw require('../../utils/ApiError').badRequest(`The ${field} you entered is already in use by another product.`);
    }
    throw error;
  }

  // 📝 LOG AUDIT: Centralized Stock Arrival
  if (initialStock > 0) {
    await inventoryService.updateStock(product.id, initialStock, {
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

  if (existingProduct.internalState === 'IN_REPAIR') {
    throw ApiError.badRequest('Cannot edit a product that is currently in repair at the workshop. Please receive it back from repair first.');
  }

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

  if (baseProductData.makeForOrder !== undefined) {
    baseProductData.makeForOrder = String(baseProductData.makeForOrder) === 'true';
  }

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
  if (baseProductData.imagesToDelete !== undefined) {
    delete baseProductData.imagesToDelete; // Prevent Prisma unknown argument error
  }
  delete baseProductData.isManualPrice;
  delete baseProductData.isPriceManual;

  // Handle specifications (embed into categoryAttributes since it is not a direct Prisma column)
  if (baseProductData.specifications !== undefined) {
    if (baseProductData.specifications && typeof baseProductData.specifications === 'object' && Object.keys(baseProductData.specifications).length > 0) {
      baseProductData.categoryAttributes = {
        ...(existingProduct.categoryAttributes || {}),
        ...(baseProductData.categoryAttributes || {}),
        specifications: baseProductData.specifications
      };
    }
    delete baseProductData.specifications;
  }

  // Normalize unique fields
  if (baseProductData.huid === "") baseProductData.huid = null;
  if (baseProductData.tagId === "") delete baseProductData.tagId;
  if (baseProductData.sku === "") delete baseProductData.sku;

  const activeMakingPct = baseProductData.makingPercentage !== undefined
    ? Number(baseProductData.makingPercentage || 0)
    : Number(existingProduct.makingPercentage || 0);

  let updatedProduct;
  try {
    updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        ...baseProductData,
        categoryId: resolvedCategoryId || undefined,
        price: pricingResults.price || existingProduct.price,
        finalPrice: pricingResults.finalPrice || existingProduct.finalPrice,
        ...(pricingResults.makingCharges !== undefined && activeMakingPct > 0 && {
          makingCharges: pricingResults.makingCharges
        }),
        images: newImagesData.length > 0 ? {
          create: newImagesData
        } : undefined,
        metalDetails: metalDetails ? {
          upsert: {
            create: (() => { const { id, productId, ...rest } = pricingResults.metalDetails || {}; return rest; })(),
            update: (() => { const { id, productId, ...rest } = pricingResults.metalDetails || {}; return rest; })()
          }
        } : undefined,
        stoneDetails: stoneDetails ? {
          deleteMany: {},
          create: pricingResults.stoneDetails.map(s => ({
            stoneType: s.stoneType || 'Other',
            synthetic: Boolean(s.synthetic),
            shape: s.shape || null,
            netWeight: (s.netWeight !== undefined && s.netWeight !== null && String(s.netWeight).trim() !== '') ? Number(s.netWeight) : 0,
            color: s.color || null,
            clarity: s.clarity || null,
            carat: s.carat ? String(s.carat) : null,
            cut: s.cut || null,
            certification: s.certification || null,
            rate: (s.rate !== undefined && s.rate !== null && String(s.rate).trim() !== '') ? Number(s.rate) : 0
          }))
        } : undefined
      },
      include: { images: true, metalDetails: true, stoneDetails: true }
    });
  } catch (error) {
    if (error.code === 'P2002') {
      const target = error.meta?.target || [];
      const field = target[0] || 'unique field';
      throw require('../../utils/ApiError').badRequest(`The ${field} you entered is already in use by another product.`);
    }
    throw error;
  }

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
    include: { images: true, metalDetails: true, stoneDetails: true, category: true }
  });
  if (!product) throw ApiError.notFound('Product not found');

  if (product.internalState === 'IN_REPAIR') {
    throw ApiError.badRequest('Cannot delete a product that is currently in repair at the workshop. Please receive it back from repair first.');
  }

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

  // Try to completely erase the product (Hard Delete)
  // If it fails due to foreign key constraints (e.g. past orders), fallback to Soft Delete
  try {
    await prisma.product.delete({
      where: { id: productId }
    });
    logger.info(`Product permanently hard-deleted: ${productId}`);
  } catch (error) {
    // P2003 is the Prisma error code for Foreign Key Constraint Failed
    if (error.code === 'P2003') {
      logger.info(`Product ${productId} has associated records (orders/inventory), falling back to soft delete.`);
      await prisma.product.update({
        where: { id: productId },
        data: {
          status: 'archived',
          deletedAt: new Date(),
          stock: 0
        }
      });
    } else {
      throw error;
    }
  }

  // Clear caches: detail and listings
  await cacheHelper.del(`${CACHE_KEYS.PRODUCT_DETAIL}:${productId}`);
  await cacheHelper.delPattern(`${CACHE_KEYS.PRODUCT_DETAIL}:*`);

  logger.info(`Product deleted: ${productId}`);
};

const getProductByScannedCode = async (scannedCode) => {
  const cleanCode = scannedCode ? scannedCode.trim() : '';
  const product = await prisma.product.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { sku: { equals: cleanCode, mode: 'insensitive' } },
        { tagId: { equals: cleanCode, mode: 'insensitive' } },
        { huid: { equals: cleanCode, mode: 'insensitive' } },
        { name: { equals: cleanCode, mode: 'insensitive' } },
        { name: { contains: cleanCode, mode: 'insensitive' } }
      ]
    },
    include: { metalDetails: true, stoneDetails: true, images: true }
  });

  if (!product) {
    throw ApiError.notFound('Product not found with this barcode or name');
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
    status: { in: ['active', 'out_of_stock', 'sold'] },
    deletedAt: null,
    carbonsmithworld: false,
    makeForOrder: false
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
  if (sort === 'price' || sort === 'price-asc') orderBy = { finalPrice: 'asc' };
  if (sort === '-price' || sort === 'price-desc') orderBy = { finalPrice: 'desc' };
  if (sort === 'views' || sort === 'popularity') orderBy = { views: 'desc' };
  if (sort === 'rating') orderBy = { rating: 'desc' };
  if (sort === 'discount') orderBy = { discount: 'desc' };
  if (sort === 'recommended') orderBy = { featured: 'desc' };

  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take: Number(limit),
    include: { images: true, metalDetails: true, stoneDetails: true, category: true }
  });

  const total = await prisma.product.count({ where });

  return { products, total, page: Number(page), limit: Number(limit) };
};

const getFeaturedProducts = async (options = {}) => {
  const { page = 1, limit = 20, sort = '-createdAt' } = options;

  const where = {
    featured: true,
    status: { in: ['active', 'out_of_stock', 'sold'] },
    deletedAt: null,
    carbonsmithworld: false,
    makeForOrder: false
  };

  const skip = (page - 1) * limit;
  let orderBy = { createdAt: 'desc' };
  if (sort === 'price' || sort === 'price-asc') orderBy = { finalPrice: 'asc' };
  if (sort === '-price' || sort === 'price-desc') orderBy = { finalPrice: 'desc' };
  if (sort === 'views' || sort === 'popularity') orderBy = { views: 'desc' };
  if (sort === 'rating') orderBy = { rating: 'desc' };
  if (sort === 'discount') orderBy = { discount: 'desc' };

  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take: Number(limit),
    include: { images: true, metalDetails: true, stoneDetails: true, category: true }
  });

  const total = await prisma.product.count({ where });

  return { products, total, page: Number(page), limit: Number(limit) };
};

const getTrendingProducts = async (options = {}) => {
  const { page = 1, limit = 20, sort = '-views' } = options;

  const where = {
    trending: true,
    status: { in: ['active', 'out_of_stock', 'sold'] },
    deletedAt: null,
    carbonsmithworld: false,
    makeForOrder: false
  };

  const skip = (page - 1) * limit;
  let orderBy = { views: 'desc' };
  if (sort === 'price' || sort === 'price-asc') orderBy = { finalPrice: 'asc' };
  if (sort === '-price' || sort === 'price-desc') orderBy = { finalPrice: 'desc' };
  if (sort === 'newest') orderBy = { createdAt: 'desc' };
  if (sort === 'rating') orderBy = { rating: 'desc' };
  if (sort === 'discount') orderBy = { discount: 'desc' };
  if (sort === 'recommended') orderBy = { featured: 'desc' };

  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take: Number(limit),
    include: { images: true, metalDetails: true, stoneDetails: true, category: true }
  });

  const total = await prisma.product.count({ where });

  return { products, total, page: Number(page), limit: Number(limit) };
};

const updateProductStock = async (productId, data, userId = null) => {
  const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
  if (!existingProduct) throw require('../../utils/ApiError').notFound('Product not found');

  if (existingProduct.internalState === 'IN_REPAIR') {
    throw require('../../utils/ApiError').badRequest('Cannot adjust stock of a product currently in repair at the workshop. Please receive it back from repair first.');
  }

  let delta = 0;
  if (data.quantityChange !== undefined && data.quantityChange !== null && data.quantityChange !== '') {
    delta = Number(data.quantityChange);
  } else if (data.stock !== undefined && data.stock !== null && data.stock !== '') {
    delta = Number(data.stock) - existingProduct.stock;
  }

  if (delta === 0) {
    return existingProduct;
  }

  const updatedProduct = await inventoryService.updateStock(productId, delta, {
    type: delta > 0 ? 'purchase' : 'adjustment',
    action: 'ADMIN_STOCK_UPDATE',
    performedBy: userId,
    notes: data.notes || 'Stock updated from admin panel'
  });

  await cacheHelper.del(`${CACHE_KEYS.PRODUCT_DETAIL}:${productId}`);
  await cacheHelper.delPattern(`${CACHE_KEYS.PRODUCT_DETAIL}:*`);

  return updatedProduct;
};

// Also expose pricing recalculators directly on product service since other modules expect them here
const recalculatePricesForMetal = pricingService.recalculatePricesForMetal;
const recalculatePricesForDiamond = pricingService.recalculatePricesForDiamond;

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStock,
  deleteProduct,
  getProductByScannedCode,
  getProductsByCategory,
  getFeaturedProducts,
  getTrendingProducts,
  recalculatePricesForMetal,
  recalculatePricesForDiamond
};
