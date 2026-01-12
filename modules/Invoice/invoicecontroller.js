const invoiceService = require('./invoiceservice');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { asyncHandler } = require('../../middlewares/error.middleware');
const Invoice = require('./invoicemodel'); // Import Invoice model
const Order = require('../order/order.model'); // Import Order model
const User = require('../user/user.model'); // Import User model
const fs = require('fs');
const path = require('path');

const generateInvoice = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  
  // Only admins can generate invoices
  if (req.user.role !== 'admin') {
    throw ApiError.forbidden('Only administrators can generate invoices');
  }
  
  try {
    const result = await invoiceService.generateInvoice(orderId, req.user._id);
    ApiResponse.success(result.invoice, result.message).send(res);
  } catch (error) {
    // Log the specific error for debugging
    console.error('Invoice generation failed:', {
      orderId,
      adminId: req.user._id,
      error: error.message,
      stack: error.stack
    });
    
    // If it's a validation error, send more details
    if (error.name === 'ValidationError') {
      const errors = {};
      for (const field in error.errors) {
        errors[field] = error.errors[field].message;
      }
      
      return res.status(400).json({
        success: false,
        message: 'Invoice validation failed',
        errors: errors,
        suggestion: 'Check required fields: invoiceNumber, dueDate'
      });
    }
    
    throw error;
  }
});

const downloadInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  
  const fileInfo = await invoiceService.downloadInvoice(invoiceId);
  
  // Set headers for file download
  res.setHeader('Content-Type', fileInfo.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
  
  // Stream the file
  const fileStream = fs.createReadStream(fileInfo.filePath);
  fileStream.pipe(res);
  
  fileStream.on('error', (error) => {
    console.error('File stream error:', error);
    res.status(500).end();
  });
});

const getInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  
  const invoice = await Invoice.findById(invoiceId)
    .populate('order')
    .populate('user', 'name email')
    .populate('metadata.generatedBy', 'name email');
  
  if (!invoice) {
    throw ApiError.notFound('Invoice not found');
  }
  
  // Check if user is authorized (admin or invoice owner)
  if (req.user.role !== 'admin' && invoice.user.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('You are not authorized to view this invoice');
  }
  
  ApiResponse.success(invoice, 'Invoice fetched successfully').send(res);
});

const getAllInvoices = asyncHandler(async (req, res) => {
  const filters = req.query;
  const options = {
    page: req.query.page || 1,
    limit: req.query.limit || 10,
    sortBy: req.query.sortBy || 'createdAt',
    sortOrder: req.query.sortOrder || 'desc'
  };
  
  // If user is not admin, only show their invoices
  if (req.user.role !== 'admin') {
    filters.userId = req.user._id;
  }
  
  const result = await invoiceService.getAllInvoices(filters, options);
  
  ApiResponse.paginated(
    result.invoices,
    result.page,
    result.limit,
    result.total,
    'Invoices fetched successfully'
  ).send(res);
});

const deleteInvoice = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  
  // Only admins can delete invoices
  if (req.user.role !== 'admin') {
    throw ApiError.forbidden('Only administrators can delete invoices');
  }
  
  await invoiceService.deleteInvoice(invoiceId);
  
  ApiResponse.success(null, 'Invoice deleted successfully').send(res);
});

const previewInvoice = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  
  // Only admins can preview invoices
  if (req.user.role !== 'admin') {
    throw ApiError.forbidden('Only administrators can preview invoices');
  }
  
  // Fetch order data for preview
  const order = await Order.findById(orderId)
    .populate('user', 'name email phone')
    .populate('items.product', 'name price weight metalType')
    .lean();
  
  if (!order) {
    throw ApiError.notFound('Order not found');
  }
  
  // Get user address
  const user = await User.findById(order.user._id).select('addresses').lean();
  const shippingAddress = user.addresses.find(addr => addr.isDefault) || 
                         user.addresses[0] || 
                         order.shippingAddress;
  
  // Prepare preview data
  const previewData = {
    order,
    user: order.user,
    shippingAddress,
    companyInfo: {
      name: 'Golden Jewels Pvt. Ltd.',
      address: '123 Diamond Street, Jewelry District',
      city: 'Mumbai, Maharashtra 400001',
      phone: '+91 22 1234 5678',
      email: 'billing@goldenjewels.com',
      gstin: '27AABCU9603R1ZX'
    },
    generatedBy: req.user,
    generatedAt: new Date()
  };
  
  ApiResponse.success(previewData, 'Invoice preview data').send(res);
});

const getInvoiceByOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  
  const invoice = await Invoice.findByOrderId(orderId)
    .populate('order')
    .populate('user', 'name email')
    .populate('metadata.generatedBy', 'name email');
  
  if (!invoice) {
    // Return a proper 404 with more info
    throw new ApiError(404, 'Invoice not found for this order', {
      orderId: orderId,
      suggestion: 'Generate an invoice first using the generate endpoint'
    });
  }
  
  // Check if user is authorized (admin or invoice owner)
  if (req.user.role !== 'admin' && invoice.user.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('You are not authorized to view this invoice');
  }
  
  ApiResponse.success(invoice, 'Invoice fetched successfully').send(res);
});

module.exports = {
  generateInvoice,
  downloadInvoice,
  getInvoice,
  getAllInvoices,
  deleteInvoice,
  previewInvoice,
  getInvoiceByOrder
};