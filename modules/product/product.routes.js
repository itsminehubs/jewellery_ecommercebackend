const express = require('express');
const router = express.Router();
const productController = require('./product.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { productImageUpload } = require('../../middlewares/upload.middleware');
const validate = require('../../middlewares/validate.middleware');
const productValidation = require('../../validations/product.validation');
const { PERMISSIONS } = require('../../utils/constants');

router.get('/', productController.getAllProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/trending', productController.getTrendingProducts);
router.get('/sku/:sku', productController.getProductBySku);
router.get('/:id', productController.getProduct);
router.get('/category/:category', productController.getProductsByCategory);

router.post('/', authenticate, checkPermission(PERMISSIONS.PRODUCT_CREATE), productImageUpload, validate(productValidation.createProduct), productController.createProduct);
router.put('/:id', authenticate, checkPermission(PERMISSIONS.PRODUCT_EDIT), productImageUpload, validate(productValidation.updateProduct), productController.updateProduct);
router.delete('/:id', authenticate, checkPermission(PERMISSIONS.PRODUCT_DELETE), productController.deleteProduct);


module.exports = router;