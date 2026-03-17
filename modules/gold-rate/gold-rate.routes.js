const express = require('express');
const router = express.Router();
const goldRateController = require('./gold-rate.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');

router.get('/current', goldRateController.getCurrentRates);
router.get('/latest', goldRateController.getLatestRate);

// Admin/Staff only routes to update rates
router.post('/', authenticate, isAdmin, goldRateController.updateRate);

module.exports = router;
