const invoiceService = require('./invoice.service');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { asyncHandler } = require('../../middlewares/error.middleware');
const prisma = require('../../config/prisma');

const generateInvoice = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const result = await invoiceService.generateInvoice(orderId, req.user.id);
  ApiResponse.success(result.invoice, result.message).send(res);
});

const downloadInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  const fileInfo = await invoiceService.downloadInvoice(invoiceId);
  
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${fileInfo.fileName}"`,
    'Content-Length': fileInfo.buffer.length
  });

  res.send(fileInfo.buffer);
});

const getInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { order: true, user: { select: { name: true, email: true } } }
  });

  if (!invoice) throw ApiError.notFound('Invoice not found');
  
  const isStaff = req.user.role !== 'user';
  if (!isStaff && invoice.userId !== req.user.id) {
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
  if (!isStaff) filters.userId = req.user.id;
  
  const result = await invoiceService.getAllInvoices(filters, options);
  ApiResponse.paginated(result.invoices, result.page, result.limit, result.total).send(res);
});

const getInvoiceByOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const invoice = await prisma.invoice.findUnique({
      where: { orderId },
      include: { order: true, user: { select: { name: true, email: true } } }
  });

  if (!invoice) throw ApiError.notFound('Invoice not found');
  
  const isStaff = req.user.role !== 'user';
  if (!isStaff && invoice.userId !== req.user.id) {
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
