const express = require('express');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const { USER_ROLES } = require('../../utils/constants');
const diamondRateController = require('./diamondRate.controller');

const router = express.Router();

router.get('/latest', diamondRateController.getLatestRates);
router.get('/history', protect, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.STORE_MANAGER), diamondRateController.getRateHistory);

router.post('/', protect, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN), diamondRateController.addRate);
router.put('/:id', protect, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN), diamondRateController.updateRate);
router.delete('/:id', protect, authorize(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN), diamondRateController.deleteRate);

module.exports = router;
