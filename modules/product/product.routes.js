const express = require('express');
const router = express.Router();
const productController = require('./product.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { productImageUpload } = require('../../middlewares/upload.middleware');
const validate = require('../../middlewares/validate.middleware');
const productValidation = require('../../validations/product.validation');
const { PERMISSIONS } = require('../../utils/constants');

// Middleware to parse stringified JSON from FormData
const parseProductData = (req, res, next) => {
    const fieldsToParse = ['metalDetails', 'stoneDetails', 'basicDetails', 'categoryAttributes', 'specifications'];
    fieldsToParse.forEach(field => {
        if (req.body[field] && typeof req.body[field] === 'string') {
            try {
                req.body[field] = JSON.parse(req.body[field]);
            } catch (error) {
                console.warn(`Failed to parse ${field}:`, error.message);
            }
        }
    });
    next();
};

router.get('/', productController.getAllProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/trending', productController.getTrendingProducts);
router.get('/sku/:sku', productController.getProductBySku);
router.get('/:id', productController.getProduct);
router.get('/category/:category', productController.getProductsByCategory);

router.post('/', authenticate, checkPermission(PERMISSIONS.PRODUCT_CREATE), productImageUpload, parseProductData, validate(productValidation.createProduct), productController.createProduct);
router.put('/:id', authenticate, checkPermission(PERMISSIONS.PRODUCT_EDIT), productImageUpload, parseProductData, validate(productValidation.updateProduct), productController.updateProduct);
router.delete('/:id', authenticate, checkPermission(PERMISSIONS.PRODUCT_DELETE), productController.deleteProduct);


module.exports = router;