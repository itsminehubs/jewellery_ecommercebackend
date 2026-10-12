const express = require('express');
const router = express.Router();
const schemeController = require('./scheme.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

router.use(authenticate); // Require authentication for all scheme routes

router.post('/enroll', schemeController.enrollCustomer);
router.get('/terms', schemeController.getSchemeTerms);
// Admin-configurable scheme defaults (min installment, applicable purities, tenure)
router.get('/settings', schemeController.getSchemeSettings);
router.put('/settings', schemeController.updateSchemeSettings);
router.get('/', schemeController.getStoreSchemes);
router.get('/statements', schemeController.getUserStatements);
router.get('/:id', schemeController.getScheme);
router.get('/:id/quote', schemeController.getRedemptionQuote);
router.post('/:id/request-closure-otp', schemeController.requestClosureOTP);
router.post('/:id/close-with-otp', schemeController.closeSchemeWithOTP);
router.put('/:id', schemeController.updateScheme);
router.delete('/:id', schemeController.deleteScheme);
router.post('/:id/installments', schemeController.recordInstallment);

module.exports = router;
