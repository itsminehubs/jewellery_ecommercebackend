const express = require('express');
const router = express.Router();

const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/user/user.routes');
const productRoutes = require('../modules/product/product.routes');
const orderRoutes = require('../modules/order/order.routes');
const paymentRoutes = require('../modules/payment/payment.routes');
const bannerRoutes = require('../modules/banner/banner.routes');
const adminRoutes = require('../modules/admin/admin.routes');
const { handleWebhook } = require('../modules/payment/razorpay.webhook');

// Webhook endpoint (before JSON parsing middleware)
router.post('/webhooks/razorpay', express.raw({ type: 'application/json' }), handleWebhook);

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/banners', bannerRoutes);
router.use('/admin', adminRoutes);

// API info
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Jewelry E-Commerce API',
    version: process.env.API_VERSION || 'v1',
    endpoints: {
      auth: '/auth',
      users: '/users',
      products: '/products',
      orders: '/orders',
      payments: '/payments',
      banners: '/banners',
      admin: '/admin'
    }
  });
});

module.exports = router;