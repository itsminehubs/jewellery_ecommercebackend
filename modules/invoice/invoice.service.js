const Invoice = require('./invoice.model');
const Order = require('../order/order.model');
const User = require('../user/user.model');
const ApiError = require('../../utils/ApiError');
const { generateInvoicePDF, getInvoicePath } = require('../../utils/constants'); // Placeholder - need to check logic
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

const generateInvoice = async (orderId, adminId) => {
  const order = await Order.findById(orderId).populate('user').populate('items.product').lean();
  if (!order) throw ApiError.notFound('Order not found');

  const invoiceNumber = `INV-${Date.now()}`;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  const invoice = new Invoice({
    order: orderId,
    user: order.user._id,
    invoiceNumber,
    issueDate: new Date(),
    dueDate,
    items: order.items.map(item => ({
      product: item.product._id,
      name: item.product.name,
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity
    })),
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.totalAmount,
    status: 'sent',
    metadata: {
      generatedBy: adminId
    }
  });

  await invoice.save();
  logger.info(`Invoice generated: ${invoice.invoiceNumber}`);
  return { invoice, message: 'Invoice generated successfully' };
};

const downloadInvoice = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found');
  
  // Logic to return file path or generate on the fly
  return {
    filePath: path.join(process.cwd(), 'uploads', 'invoices', `${invoice.invoiceNumber}.pdf`),
    fileName: `${invoice.invoiceNumber}.pdf`,
    contentType: 'application/pdf'
  };
};

const getAllInvoices = async (filters = {}, options = {}) => {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;
  const skip = (page - 1) * limit;

  const invoices = await Invoice.find(filters)
    .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
    .skip(skip)
    .limit(limit)
    .populate('user', 'name email');

  const total = await Invoice.countDocuments(filters);
  return { invoices, total, page, limit };
};

const deleteInvoice = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice not found');
  await invoice.deleteOne();
};

module.exports = {
  generateInvoice,
  downloadInvoice,
  getAllInvoices,
  deleteInvoice
};
