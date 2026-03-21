const express = require('express');
const router = express.Router();
const bannerController = require('./banner.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { singleImageUpload } = require('../../middlewares/upload.middleware');
const { PERMISSIONS } = require('../../utils/constants');

router.get('/', bannerController.getAllBanners);
router.get('/active', bannerController.getActiveBanners);

router.post('/', authenticate, checkPermission(PERMISSIONS.MANAGE_BANNERS), singleImageUpload, bannerController.createBanner);
router.put('/:id', authenticate, checkPermission(PERMISSIONS.MANAGE_BANNERS), singleImageUpload, bannerController.updateBanner);
router.delete('/:id', authenticate, checkPermission(PERMISSIONS.MANAGE_BANNERS), bannerController.deleteBanner);


module.exports = router;