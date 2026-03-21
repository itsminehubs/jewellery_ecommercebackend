const invoiceService = require('./invoice.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { asyncHandler } = require('../../middlewares/error.middleware');
const Invoice = require('./invoice.model');
const Order = require('../order/order.model');
const User = require('../user/user.model');
const fs = require('fs');
const path = require('path');

const generateInvoice = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const result = await invoiceService.generateInvoice(orderId, req.user._id);
  ApiResponse.success(result.invoice, result.message).send(res);
});

const downloadInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  const fileInfo = await invoiceService.downloadInvoice(invoiceId);
  res.setHeader('Content-Type', fileInfo.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
  const fileStream = fs.createReadStream(fileInfo.filePath);
  fileStream.pipe(res);
  fileStream.on('error', (error) => {
    console.error('File stream error:', error);
    res.status(500).end();
  });
});

const getInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  const invoice = await Invoice.findById(invoiceId).populate('order').populate('user', 'name email');
  if (!invoice) throw ApiError.notFound('Invoice not found');
  
  const isStaff = req.user.role !== 'user';
  if (!isStaff && invoice.user.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('You are not authorized to view this invoice');
  }
  ApiResponse.success(invoice, 'Invoice fetched successfully').send(res);
});

const getAllInvoices = asyncHandler(async (req, res) => {
  const filters = req.query;
  const options = {
    page: req.query.page || 1,
    limit: req.query.limit || 10
  };
  
  const isStaff = req.user.role !== 'user';
  if (!isStaff) filters.user = req.user._id;
  
  const result = await invoiceService.getAllInvoices(filters, options);
  ApiResponse.paginated(result.invoices, result.page, result.limit, result.total).send(res);
});

const getInvoiceByOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const invoice = await Invoice.findOne({ order: orderId }).populate('order').populate('user', 'name email');
  if (!invoice) throw ApiError.notFound('Invoice not found');
  
  const isStaff = req.user.role !== 'user';
  if (!isStaff && invoice.user.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('You are not authorized to view this invoice');
  }
  ApiResponse.success(invoice, 'Invoice fetched successfully').send(res);
});

const deleteInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  await invoiceService.deleteInvoice(invoiceId);
  ApiResponse.success(null, 'Invoice deleted successfully').send(res);
});

module.exports = {
  generateInvoice,
  downloadInvoice,
  getInvoice,
  getInvoiceByOrder,
  getAllInvoices,
  deleteInvoice
};
