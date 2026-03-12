const express = require('express');
const router = express.Router();
const goldRateController = require('./gold-rate.controller');
const { auth, isAdmin } = require('../../middlewares/auth.middleware');

router.get('/current', goldRateController.getCurrentRates);
router.get('/latest', goldRateController.getLatestRate);

// Admin/Staff only routes to update rates
router.post('/', auth, isAdmin, goldRateController.updateRate);

module.exports = router;
