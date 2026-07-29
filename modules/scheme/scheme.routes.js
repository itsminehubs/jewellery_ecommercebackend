const express = require('express');
const router = express.Router();
const schemeController = require('./scheme.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate); // Require authentication for all scheme routes

router.post('/enroll', schemeController.enrollCustomer);
router.get('/', schemeController.getStoreSchemes);
router.post('/:id/installments', schemeController.recordInstallment);

module.exports = router;
