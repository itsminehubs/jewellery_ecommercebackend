const bannerService = require('./banner.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');
const { deleteFile } = require('../../middlewares/upload.middleware');

const getAllBanners = asyncHandler(async (req, res) => {
  const banners = await bannerService.getAllBanners(req.query);
  ApiResponse.success(banners, 'Banners fetched successfully').send(res);
});

const getActiveBanners = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const banners = await bannerService.getActiveBanners(type);
  ApiResponse.success(banners, 'Active banners fetched').send(res);
});

const createBanner = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Banner image required');
  
  const banner = await bannerService.createBanner(req.body, req.file.path);
  await deleteFile(req.file.path);
  
  ApiResponse.created(banner, 'Banner created successfully').send(res);
});

const updateBanner = asyncHandler(async (req, res) => {
  const imagePath = req.file ? req.file.path : null;
  const banner = await bannerService.updateBanner(req.params.id, req.body, imagePath);
  
  if (imagePath) await deleteFile(imagePath);
  
  ApiResponse.success(banner, 'Banner updated successfully').send(res);
});

const deleteBanner = asyncHandler(async (req, res) => {
  await bannerService.deleteBanner(req.params.id);
  ApiResponse.success(null, 'Banner deleted successfully').send(res);
});

module.exports = {
  getAllBanners,
  getActiveBanners,
  createBanner,
  updateBanner,
  deleteBanner
};