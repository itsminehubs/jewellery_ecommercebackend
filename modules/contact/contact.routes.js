const express = require('express');
const router = express.Router();
const contactController = require('./contact.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');

router.post('/', contactController.submitInquiry);
router.get('/', authenticate, checkPermission(PERMISSIONS.MANAGE_CONTACTS), contactController.getAllInquiries);
router.delete('/:id', authenticate, checkPermission(PERMISSIONS.MANAGE_CONTACTS), contactController.deleteInquiry);

module.exports = router;
