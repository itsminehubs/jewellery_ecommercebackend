const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const authValidation = require('../auth/auth.validation');
const validate = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { profileImageUpload } = require('../../middlewares/upload.middleware');

// Profile routes
router.get('/profile', authenticate, userController.getProfile);
router.put('/profile', authenticate, userController.updateProfile);
router.post('/profile/image', authenticate, profileImageUpload, userController.uploadProfileImage);

// Address routes
router.get('/addresses', authenticate, userController.getAddresses);
router.post('/addresses', authenticate, userController.addAddress);
router.put('/addresses/:addressId', authenticate, userController.updateAddress);
router.delete('/addresses/:addressId', authenticate, userController.deleteAddress);

// Cart routes
router.get('/cart', authenticate, userController.getCart);
router.post('/cart', authenticate, userController.addToCart);
router.put('/cart/:productId', authenticate, userController.updateCartItem);
router.delete('/cart/:productId', authenticate, userController.removeFromCart);
router.delete('/cart', authenticate, userController.clearCart);

// Wishlist routes
router.get('/wishlist', authenticate, userController.getWishlist);
router.post('/wishlist', authenticate, userController.addToWishlist);
router.delete('/wishlist/:productId', authenticate, userController.removeFromWishlist);
router.delete('/wishlist', authenticate, userController.clearWishlist);

router.delete('/profile', authenticate, validate(authValidation.deleteAccount), userController.deleteAccount);

// Loyalty routes
router.get('/loyalty', authenticate, userController.getLoyaltyInfo);
router.post('/loyalty/redeem', authenticate, userController.redeemLoyaltyPoints);
router.post('/fcm-token', authenticate, userController.updateFcmToken);

module.exports = router;