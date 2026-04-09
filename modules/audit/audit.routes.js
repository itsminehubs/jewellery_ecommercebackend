const express = require('express');
const router = express.Router();
const auditController = require('./audit.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkAnyPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');

// --- AUDIT LOG ROUTES ---

router.use(authenticate);

// Get all system audit logs (Super Admin / Admin Only)
router.get('/', checkAnyPermission([PERMISSIONS.VIEW_AUDIT_LOGS, PERMISSIONS.VIEW_GLOBAL_REPORTS]), auditController.getGlobalAudits);

// Get audit trail for a specific product
router.get('/product/:productId', checkAnyPermission([PERMISSIONS.VIEW_AUDIT_LOGS, PERMISSIONS.VIEW_GLOBAL_REPORTS]), auditController.getProductAudits);

module.exports = router;
