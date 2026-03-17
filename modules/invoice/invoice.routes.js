const express = require('express');
const router = express.Router();
const invoiceController = require('./invoice.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/admin.middleware');

router.use(authenticate);

router.post('/order/:orderId/generate', isAdmin, invoiceController.generateInvoice);
router.get('/:invoiceId/download', invoiceController.downloadInvoice);
router.get('/', invoiceController.getAllInvoices);
router.get('/:invoiceId', invoiceController.getInvoice);
router.delete('/:invoiceId', isAdmin, invoiceController.deleteInvoice);

module.exports = router;
