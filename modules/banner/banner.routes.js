const express = require('express');
const router = express.Router();
const bannerController = require('./banner.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');
const { singleImageUpload } = require('../../middlewares/upload.middleware');

router.get('/', bannerController.getAllBanners);
router.get('/active', bannerController.getActiveBanners);
router.post('/', authenticate, isAdmin, singleImageUpload, bannerController.createBanner);
router.put('/:id', authenticate, isAdmin, singleImageUpload, bannerController.updateBanner);
router.delete('/:id', authenticate, isAdmin, bannerController.deleteBanner);

module.exports = router;