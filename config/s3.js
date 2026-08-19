const { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;
const CLOUDFRONT_URL = process.env.CLOUDFRONT_URL;

/**
 * Generate a unique file name
 */
const generateUniqueFileName = (originalName) => {
  const ext = path.extname(originalName);
  const hash = crypto.randomBytes(16).toString('hex');
  return `${Date.now()}-${hash}${ext}`;
};

/**
 * Upload image to S3
 * @param {string} filePath - Local file path
 * @param {string} folder - S3 folder name
 * @param {Object} options - Additional upload options (ignored for S3 compatibility)
 * @returns {Promise<Object>}
 */
const uploadImage = async (filePath, folder = 'jewelry', options = {}) => {
  try {
    const fileStream = fs.createReadStream(filePath);
    const fileName = generateUniqueFileName(filePath);
    const key = `${folder}/${fileName}`;

    const contentType = getContentType(filePath);

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileStream,
      ContentType: contentType,
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    logger.info(`Image uploaded to S3: ${key}`);

    return {
      public_id: key,
      url: `${CLOUDFRONT_URL}/${key}`,
      format: path.extname(filePath).replace('.', ''),
      resource_type: 'image'
    };
  } catch (error) {
    logger.error(`Failed to upload image to S3: ${error.message}`);
    throw error;
  }
};

/**
 * Upload multiple images
 * @param {Array<string>} filePaths - Array of file paths
 * @param {string} folder - S3 folder name
 * @returns {Promise<Array<Object>>}
 */
const uploadMultipleImages = async (filePaths, folder = 'jewelry') => {
  try {
    const uploadPromises = filePaths.map(filePath => 
      uploadImage(filePath, folder)
    );

    const results = await Promise.all(uploadPromises);
    logger.info(`${results.length} images uploaded to S3`);
    
    return results;
  } catch (error) {
    logger.error(`Failed to upload multiple images: ${error.message}`);
    throw error;
  }
};

/**
 * Delete image from S3
 * @param {string} publicId - S3 object key
 * @returns {Promise<Object>}
 */
const deleteImage = async (publicId) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: publicId,
    });
    const result = await s3Client.send(command);
    logger.info(`Image deleted from S3: ${publicId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to delete image from S3: ${error.message}`);
    throw error;
  }
};

/**
 * Delete multiple images from S3
 * @param {Array<string>} publicIds - Array of S3 object keys
 * @returns {Promise<Object>}
 */
const deleteMultipleImages = async (publicIds) => {
  if (!publicIds || publicIds.length === 0) return {};
  
  try {
    const command = new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: publicIds.map(id => ({ Key: id })),
        Quiet: false,
      },
    });
    const result = await s3Client.send(command);
    logger.info(`${publicIds.length} images deleted from S3`);
    return result;
  } catch (error) {
    logger.error(`Failed to delete multiple images: ${error.message}`);
    throw error;
  }
};

/**
 * Helper to determine content type from file extension
 */
const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf',
  };
  return types[ext] || 'application/octet-stream';
};

/**
 * Mock methods for compatibility with Cloudinary
 */
const getImageDetails = async (publicId) => {
  return { public_id: publicId, url: `${CLOUDFRONT_URL}/${publicId}` };
};

const generateOptimizedUrl = (publicId, transformations = {}) => {
  return `${CLOUDFRONT_URL}/${publicId}`;
};

const generateThumbnail = (publicId, width = 200, height = 200) => {
  return `${CLOUDFRONT_URL}/${publicId}`;
};

const initializeCloudinary = () => {
  logger.info('AWS S3 wrapper initialized (replacing Cloudinary)');
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
};
