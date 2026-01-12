const express = require('express');
const router = express.Router();
const invoiceController = require('./invoicecontroller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require("../../middlewares/admin.middleware");

// All invoice routes require authentication
router.use(authenticate);

// Admin-only routes
router.post('/order/:orderId/generate', isAdmin, invoiceController.generateInvoice);
router.get('/:invoiceId/download', invoiceController.downloadInvoice); // Allow both admin and users to download their invoices
router.get('/preview/:orderId', isAdmin, invoiceController.previewInvoice);
router.delete('/:invoiceId', isAdmin, invoiceController.deleteInvoice);

// Get invoices
router.get('/', invoiceController.getAllInvoices); // Both admin and users can get invoices (filtered by user for non-admin)
router.get('/order/:orderId', invoiceController.getInvoiceByOrder); // Get invoice by order ID
router.get('/:invoiceId', invoiceController.getInvoice); // Get single invoice by ID

module.exports = router;