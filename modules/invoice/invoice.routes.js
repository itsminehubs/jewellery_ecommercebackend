const express = require('express');
const router = express.Router();
const invoiceController = require('./invoice.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { checkPermission } = require('../../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../../utils/constants');

router.use(authenticate);
router.use(checkPermission(PERMISSIONS.ORDER_VIEW_ALL));

router.post('/order/:orderId/generate', invoiceController.generateInvoice);
router.get('/order/:orderId', invoiceController.getInvoiceByOrder);
router.get('/:invoiceId/download', invoiceController.downloadInvoice);
router.get('/', invoiceController.getAllInvoices);
router.get('/:invoiceId', invoiceController.getInvoice);
router.delete('/:invoiceId', invoiceController.deleteInvoice);

module.exports = router;
