const cloudinary = require('cloudinary').v2;
const logger = require('../utils/logger');

/**
 * Initialize Cloudinary
 */
const initializeCloudinary = () => {
  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });

    logger.info('Cloudinary initialized successfully');
  } catch (error) {
    logger.error(`Cloudinary initialization failed: ${error.message}`);
    throw error;
  }
};

/**
 * Upload image to Cloudinary
 * @param {string} filePath - Local file path or base64 string
 * @param {string} folder - Cloudinary folder name
 * @param {Object} options - Additional upload options
 * @returns {Promise<Object>}
 */
const uploadImage = async (filePath, folder = 'jewelry', options = {}) => {
  try {
    const uploadOptions = {
      folder,
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      ...options
    };

    const result = await cloudinary.uploader.upload(filePath, uploadOptions);
    
    logger.info(`Image uploaded to Cloudinary: ${result.public_id}`);
    
    return {
      public_id: result.public_id,
      url: result.secure_url,
      width: result.width,
      height: result.height,
      format: result.format,
      resource_type: result.resource_type
    };
  } catch (error) {
    logger.error(`Failed to upload image to Cloudinary: ${error.message}`);
    throw error;
  }
};

/**
 * Upload multiple images
 * @param {Array<string>} filePaths - Array of file paths
 * @param {string} folder - Cloudinary folder name
 * @returns {Promise<Array<Object>>}
 */
const uploadMultipleImages = async (filePaths, folder = 'jewelry') => {
  try {
    const uploadPromises = filePaths.map(filePath => 
      uploadImage(filePath, folder)
    );

    const results = await Promise.all(uploadPromises);
    logger.info(`${results.length} images uploaded to Cloudinary`);
    
    return results;
  } catch (error) {
    logger.error(`Failed to upload multiple images: ${error.message}`);
    throw error;
  }
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>}
 */
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info(`Image deleted from Cloudinary: ${publicId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to delete image from Cloudinary: ${error.message}`);
    throw error;
  }
};

/**
 * Delete multiple images
 * @param {Array<string>} publicIds - Array of public IDs
 * @returns {Promise<Object>}
 */
const deleteMultipleImages = async (publicIds) => {
  try {
    const result = await cloudinary.api.delete_resources(publicIds);
    logger.info(`${publicIds.length} images deleted from Cloudinary`);
    return result;
  } catch (error) {
    logger.error(`Failed to delete multiple images: ${error.message}`);
    throw error;
  }
};

/**
 * Get image details
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>}
 */
const getImageDetails = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return result;
  } catch (error) {
    logger.error(`Failed to get image details: ${error.message}`);
    throw error;
  }
};

/**
 * Generate optimized image URL
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} transformations - Image transformations
 * @returns {string}
 */
const generateOptimizedUrl = (publicId, transformations = {}) => {
  const defaultTransformations = {
    quality: 'auto',
    fetch_format: 'auto',
    ...transformations
  };

  return cloudinary.url(publicId, defaultTransformations);
};

/**
 * Generate thumbnail
 * @param {string} publicId - Cloudinary public ID
 * @param {number} width - Thumbnail width
 * @param {number} height - Thumbnail height
 * @returns {string}
 */
const generateThumbnail = (publicId, width = 200, height = 200) => {
  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'fill',
    quality: 'auto',
    fetch_format: 'auto'
  });
};

module.exports = {
  initializeCloudinary,
  uploadImage,
  uploadMultipleImages,
  deleteImage,
  deleteMultipleImages,
  getImageDetails,
  generateOptimizedUrl,
  generateThumbnail,
  cloudinary
};
