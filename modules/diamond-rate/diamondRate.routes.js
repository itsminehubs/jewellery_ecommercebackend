const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { hasRole } = require('../../middlewares/admin.middleware');
const { USER_ROLES } = require('../../utils/constants');
const diamondRateController = require('./diamondRate.controller');

const router = express.Router();

router.get('/latest', diamondRateController.getLatestRates);
router.get('/history', authenticate, hasRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.STORE_MANAGER]), diamondRateController.getRateHistory);

router.post('/', authenticate, hasRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), diamondRateController.addRate);
router.put('/:id', authenticate, hasRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), diamondRateController.updateRate);
router.delete('/:id', authenticate, hasRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), diamondRateController.deleteRate);

module.exports = router;
