const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const ApiError = require('../utils/ApiError');
const { UPLOAD_LIMITS } = require('../utils/constants');
const logger = require('../utils/logger');

// Create uploads directory if it doesn't exist
const createUploadDir = async () => {
  const uploadDir = path.join(process.cwd(), 'uploads', 'temp');
  
  try {
    await fs.mkdir(uploadDir, { recursive: true });
  } catch (error) {
    logger.error(`Failed to create upload directory: ${error.message}`);
  }
};

// Initialize upload directory
createUploadDir();

/**
 * Configure multer storage
 */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'temp');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

/**
 * File filter function
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback function
 */
const fileFilter = (req, file, cb) => {
  // Check file type
  if (!UPLOAD_LIMITS.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    return cb(
      ApiError.badRequest(
        `Invalid file type. Allowed types: ${UPLOAD_LIMITS.ALLOWED_IMAGE_TYPES.join(', ')}`
      ),
      false
    );
  }

  cb(null, true);
};

/**
 * Create multer upload instance
 * @param {Object} options - Upload options
 * @returns {Object} Multer instance
 */
const createUpload = (options = {}) => {
  const defaultOptions = {
    storage,
    fileFilter,
    limits: {
      fileSize: options.maxFileSize || UPLOAD_LIMITS.MAX_FILE_SIZE,
      files: options.maxFiles || UPLOAD_LIMITS.MAX_FILES
    }
  };

  return multer(defaultOptions);
};

/**
 * Single file upload middleware
 * @param {string} fieldName - Form field name
 * @param {Object} options - Upload options
 * @returns {Function} Middleware function
 */
const uploadSingle = (fieldName = 'image', options = {}) => {
  const upload = createUpload(options);
  return upload.single(fieldName);
};

/**
 * Multiple files upload middleware
 * @param {string} fieldName - Form field name
 * @param {number} maxCount - Maximum number of files
 * @param {Object} options - Upload options
 * @returns {Function} Middleware function
 */
const uploadMultiple = (fieldName = 'images', maxCount = 10, options = {}) => {
  const upload = createUpload({ ...options, maxFiles: maxCount });
  return upload.array(fieldName, maxCount);
};

/**
 * Multiple fields upload middleware
 * @param {Array} fields - Array of field objects
 * @param {Object} options - Upload options
 * @returns {Function} Middleware function
 */
const uploadFields = (fields, options = {}) => {
  const upload = createUpload(options);
  return upload.fields(fields);
};

/**
 * Validate uploaded file
 * @param {Object} file - Uploaded file object
 * @throws {ApiError} If validation fails
 */
const validateFile = (file) => {
  if (!file) {
    throw ApiError.badRequest('No file uploaded');
  }

  // Check file size
  if (file.size > UPLOAD_LIMITS.MAX_FILE_SIZE) {
    throw ApiError.badRequest(
      `File size exceeds limit of ${UPLOAD_LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB`
    );
  }

  // Check file type
  if (!UPLOAD_LIMITS.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    throw ApiError.badRequest('Invalid file type');
  }

  return true;
};

/**
 * Validate multiple uploaded files
 * @param {Array} files - Array of uploaded files
 * @throws {ApiError} If validation fails
 */
const validateFiles = (files) => {
  if (!files || files.length === 0) {
    throw ApiError.badRequest('No files uploaded');
  }

  if (files.length > UPLOAD_LIMITS.MAX_FILES) {
    throw ApiError.badRequest(`Maximum ${UPLOAD_LIMITS.MAX_FILES} files allowed`);
  }

  files.forEach(file => validateFile(file));

  return true;
};

/**
 * Delete uploaded file
 * @param {string} filePath - File path
 * @returns {Promise<void>}
 */
const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    logger.info(`File deleted: ${filePath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error(`Failed to delete file: ${error.message}`);
    }
  }
};

/**
 * Delete multiple files
 * @param {Array<string>} filePaths - Array of file paths
 * @returns {Promise<void>}
 */
const deleteFiles = async (filePaths) => {
  const deletePromises = filePaths.map(filePath => deleteFile(filePath));
  await Promise.all(deletePromises);
};

/**
 * Clean up temp files middleware
 * Deletes uploaded files if an error occurs
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const cleanupOnError = async (err, req, res, next) => {
  if (err) {
    // Delete uploaded files
    if (req.file) {
      await deleteFile(req.file.path);
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        await deleteFiles(req.files.map(file => file.path));
      } else {
        const filePaths = Object.values(req.files)
          .flat()
          .map(file => file.path);
        await deleteFiles(filePaths);
      }
    }
  }

  next(err);
};

/**
 * Image upload for products
 * Accepts up to 10 images
 */
const productImageUpload = uploadMultiple('images', 10);

/**
 * Single image upload for banners/avatars
 */
const singleImageUpload = uploadSingle('image');

/**
 * Profile image upload
 */
const profileImageUpload = uploadSingle('profileImage', {
  maxFileSize: 2 * 1024 * 1024 // 2MB
});

module.exports = {
  createUpload,
  uploadSingle,
  uploadMultiple,
  uploadFields,
  validateFile,
  validateFiles,
  deleteFile,
  deleteFiles,
  cleanupOnError,
  productImageUpload,
  singleImageUpload,
  profileImageUpload
};
