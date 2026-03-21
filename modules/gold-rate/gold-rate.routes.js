const express = require('express');
const router = express.Router();
const goldRateController = require('./gold-rate.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');

router.get('/current', goldRateController.getCurrentRates);
router.get('/latest', goldRateController.getLatestRate);

// Admin/Staff only routes to update rates
router.post('/', authenticate, checkPermission(PERMISSIONS.SET_GOLD_RATES), goldRateController.updateRate);
router.delete('/:metal/:purity', authenticate, checkPermission(PERMISSIONS.SET_GOLD_RATES), goldRateController.deleteRate);


module.exports = router;
