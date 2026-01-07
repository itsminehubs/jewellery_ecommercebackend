const express = require('express');
const router = express.Router();
const productController = require('./product.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');
const { productImageUpload } = require('../../middlewares/upload.middleware');

router.get('/', productController.getAllProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/trending', productController.getTrendingProducts);
router.get('/:id', productController.getProduct);
router.get('/category/:category', productController.getProductsByCategory);
router.post('/', authenticate, isAdmin, productImageUpload, productController.createProduct);
router.put('/:id', authenticate, isAdmin, productImageUpload, productController.updateProduct);
router.delete('/:id', authenticate, isAdmin, productController.deleteProduct);

module.exports = router;