const express = require('express');
const router = express.Router();
const schemeController = require('./scheme.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');

// Public endpoints for customers to browse scheme rules & store configurations
router.get('/terms', schemeController.getSchemeTerms);
router.get('/settings', schemeController.getSchemeSettings);

router.use(authenticate); // Require authentication for all user & admin scheme actions

router.post('/enroll', schemeController.enrollCustomer);
router.put('/settings', checkPermission(PERMISSIONS.SCHEME_SETTINGS), schemeController.updateSchemeSettings);
router.get('/', checkPermission(PERMISSIONS.SCHEME_VIEW), schemeController.getStoreSchemes);
router.get('/statements', schemeController.getUserStatements);
router.get('/:id', schemeController.getScheme);
router.get('/:id/quote', schemeController.getRedemptionQuote);
router.post('/:id/request-closure-otp', schemeController.requestClosureOTP);
router.post('/:id/verify-closure-otp', schemeController.verifyClosureOTP);
router.post('/:id/request-management-otp', schemeController.requestManagementClosureOTP);
router.post('/:id/verify-management-otp', schemeController.verifyManagementClosureOTP);
router.post('/:id/close-with-otp', schemeController.closeSchemeWithOTP);
router.post('/process-expired', checkPermission(PERMISSIONS.SCHEME_MANAGE), schemeController.processExpiredSchemes);
router.put('/:id', checkPermission(PERMISSIONS.SCHEME_MANAGE), schemeController.updateScheme);
router.delete('/:id', checkPermission(PERMISSIONS.SCHEME_MANAGE), schemeController.deleteScheme);
router.post('/:id/create-payment-order', schemeController.createPaymentOrder);
router.post('/:id/verify-payment', schemeController.verifyPayment);
router.post('/:id/installments', schemeController.recordInstallment);

module.exports = router;
