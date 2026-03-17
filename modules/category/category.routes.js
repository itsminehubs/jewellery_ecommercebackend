const express = require('express');
const router = express.Router();
const { getAllCategories,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory } = require('./category.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');
const { singleImageUpload } = require('../../middlewares/upload.middleware');

router.get('/', getAllCategories);
router.get('/:id', getCategory);

// Protected routes (Admin only)
router.use(authenticate);
router.use(isAdmin);

router.post('/', singleImageUpload, createCategory);
router.put('/:id', singleImageUpload, updateCategory);
router.delete('/:id', deleteCategory);

module.exports = router;
