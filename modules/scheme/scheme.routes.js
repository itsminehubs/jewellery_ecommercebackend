const express = require('express');
const router = express.Router();
const schemeController = require('./scheme.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// Public endpoints for customers to browse scheme rules & store configurations
router.get('/terms', schemeController.getSchemeTerms);
router.get('/settings', schemeController.getSchemeSettings);

router.use(authenticate); // Require authentication for all user & admin scheme actions

router.post('/enroll', schemeController.enrollCustomer);
router.put('/settings', schemeController.updateSchemeSettings);
router.get('/', schemeController.getStoreSchemes);
router.get('/statements', schemeController.getUserStatements);
router.get('/:id', schemeController.getScheme);
router.get('/:id/quote', schemeController.getRedemptionQuote);
router.post('/:id/request-closure-otp', schemeController.requestClosureOTP);
router.post('/:id/verify-closure-otp', schemeController.verifyClosureOTP);
router.post('/:id/close-with-otp', schemeController.closeSchemeWithOTP);
router.post('/process-expired', schemeController.processExpiredSchemes);
router.put('/:id', schemeController.updateScheme);
router.delete('/:id', schemeController.deleteScheme);
router.post('/:id/installments', schemeController.recordInstallment);

module.exports = router;
