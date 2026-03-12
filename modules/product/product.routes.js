const express = require('express');
const router = express.Router();
const productController = require('./product.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');
const { productImageUpload } = require('../../middlewares/upload.middleware');
const validate = require('../../middlewares/validate.middleware');
const productValidation = require('../../validations/product.validation');

router.get('/', validate(productValidation.getProducts), productController.getAllProducts);
router.get('/featured', validate(productValidation.getProducts), productController.getFeaturedProducts);
router.get('/trending', validate(productValidation.getProducts), productController.getTrendingProducts);
router.get('/:id', productController.getProduct);
router.get('/category/:category', validate(productValidation.getProducts), productController.getProductsByCategory);
router.post('/', authenticate, isAdmin, productImageUpload, validate(productValidation.createProduct), productController.createProduct);
router.put('/:id', authenticate, isAdmin, productImageUpload, validate(productValidation.updateProduct), productController.updateProduct);
router.delete('/:id', authenticate, isAdmin, productController.deleteProduct);

module.exports = router;