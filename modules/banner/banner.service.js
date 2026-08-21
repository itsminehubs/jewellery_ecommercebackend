const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const { uploadImage, deleteImage } = require('../../config/s3');
const { cacheHelper } = require('../../config');
const { CACHE_KEYS } = require('../../utils/constants');
const logger = require('../../utils/logger');

const getAllBanners = async (filters = {}) => {
  const cacheKey = `${CACHE_KEYS.BANNERS}${JSON.stringify(filters)}`;
  const cached = await cacheHelper.get(cacheKey);
  if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached;

  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;

  if (filters.page && filters.limit) {
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 10;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.banner.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { order: 'asc' },
          { createdAt: 'desc' }
        ]
      }),
      prisma.banner.count({ where })
    ]);
    return { items, total, page, limit };
  }

  const banners = await prisma.banner.findMany({
    where,
    orderBy: [
      { order: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  await cacheHelper.set(cacheKey, JSON.stringify(banners), 3600);
  
  return banners;
};

const getActiveBanners = async (type = null) => {
  const where = { status: 'active' };
  if (type) where.type = type;
  
  const now = new Date();
  where.startDate = { lte: now };
  where.endDate = { gte: now };

  const banners = await prisma.banner.findMany({
    where,
    orderBy: [
      { order: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  return banners;
};

const createBanner = async (bannerData, imagePath) => {
  const { title, link, type, order, status, startDate, endDate, metadata } = bannerData;

  const image = await uploadImage(imagePath, 'banners');
  
  const banner = await prisma.banner.create({
    data: {
      title,
      imageUrl: image.url,
      imagePublicId: image.public_id,
      link,
      type: type || 'home_main',
      order: order ? Number(order) : 0,
      status: status || 'active',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      metadata: metadata || null
    }
  });
  
  await cacheHelper.delPattern(`${CACHE_KEYS.BANNERS}*`);
  logger.info(`Banner created: ${banner.id}`);
  
  return banner;
};

const updateBanner = async (bannerId, updateData, imagePath = null) => {
  const banner = await prisma.banner.findUnique({ where: { id: bannerId } });
  if (!banner) throw ApiError.notFound('Banner not found');

  const dataToUpdate = {};
  
  if (updateData.title !== undefined) dataToUpdate.title = updateData.title;
  if (updateData.link !== undefined) dataToUpdate.link = updateData.link;
  if (updateData.type !== undefined) dataToUpdate.type = updateData.type;
  if (updateData.order !== undefined) dataToUpdate.order = Number(updateData.order);
  if (updateData.status !== undefined) dataToUpdate.status = updateData.status;
  if (updateData.startDate !== undefined) dataToUpdate.startDate = updateData.startDate ? new Date(updateData.startDate) : null;
  if (updateData.endDate !== undefined) dataToUpdate.endDate = updateData.endDate ? new Date(updateData.endDate) : null;
  if (updateData.metadata !== undefined) dataToUpdate.metadata = updateData.metadata;

  if (imagePath) {
    if (banner.imagePublicId) {
      await deleteImage(banner.imagePublicId);
    }
    const image = await uploadImage(imagePath, 'banners');
    dataToUpdate.imageUrl = image.url;
    dataToUpdate.imagePublicId = image.public_id;
  }

  const updatedBanner = await prisma.banner.update({
    where: { id: bannerId },
    data: dataToUpdate
  });
  
  await cacheHelper.delPattern(`${CACHE_KEYS.BANNERS}*`);
  
  return updatedBanner;
};

const deleteBanner = async (bannerId) => {
  const banner = await prisma.banner.findUnique({ where: { id: bannerId } });
  if (!banner) throw ApiError.notFound('Banner not found');

  if (banner.imagePublicId) {
    await deleteImage(banner.imagePublicId);
  }
  
  await prisma.banner.delete({ where: { id: bannerId } });
  await cacheHelper.delPattern(`${CACHE_KEYS.BANNERS}*`);
  logger.info(`Banner deleted: ${bannerId}`);
};

module.exports = {
  getAllBanners,
  getActiveBanners,
  createBanner,
  updateBanner,
  deleteBanner
};
