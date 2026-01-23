const Banner = require('./banner.model');
const ApiError = require('../../utils/ApiError');
const { uploadImage, deleteImage } = require('../../config/cloudinary');
const { cacheHelper } = require('../../config');
const { CACHE_KEYS } = require('../../utils/constants');
const logger = require('../../utils/logger');

const getAllBanners = async (filters = {}) => {
  const cacheKey = `${CACHE_KEYS.BANNERS}${JSON.stringify(filters)}`;
  const cached = await cacheHelper.get(cacheKey);
  if (cached) return cached;

  const banners = await Banner.find(filters).sort('order -createdAt');
  await cacheHelper.set(cacheKey, banners, 3600);
  
  return banners;
};

const getActiveBanners = async (type = null) => {
  const query = { status: 'active' };
  if (type) query.type = type;
  
  const now = new Date();
  const banners = await Banner.find(query)
    .where('startDate').lte(now)
    .where('endDate').gte(now)
    .sort('order -createdAt');

  return banners;
};

const createBanner = async (bannerData, imagePath) => {
  const image = await uploadImage(imagePath, 'banners');
  const banner = new Banner({ ...bannerData, image });
  await banner.save();
  
  await cacheHelper.delPattern(`${CACHE_KEYS.BANNERS}*`);
  logger.info(`Banner created: ${banner._id}`);
  
  return banner;
};

const updateBanner = async (bannerId, updateData, imagePath = null) => {
  const banner = await Banner.findById(bannerId);
  if (!banner) throw ApiError.notFound('Banner not found');

  if (imagePath) {
    if (banner.image.public_id) await deleteImage(banner.image.public_id);
    banner.image = await uploadImage(imagePath, 'banners');
  }

  Object.assign(banner, updateData);
  await banner.save();
  
  await cacheHelper.delPattern(`${CACHE_KEYS.BANNERS}*`);
  
  return banner;
};

const deleteBanner = async (bannerId) => {
  const banner = await Banner.findById(bannerId);
  if (!banner) throw ApiError.notFound('Banner not found');

  if (banner.image.public_id) await deleteImage(banner.image.public_id);
  
  await banner.deleteOne();
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