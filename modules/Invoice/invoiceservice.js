const Order = require('../order/order.model');
const User = require('../user/user.model');
const Invoice = require('./invoicemodel');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const ApiError = require('../../utils/ApiError');

class InvoiceService {
  /**
   * Generate invoice for an order
   * @param {string} orderId - Order ID
   * @param {string} adminId - Admin user ID who generates the invoice
   * @returns {Promise<Object>} Invoice object with download URL
   */
  async generateInvoice(orderId, adminId) {
    let filePath;

    try {
      // Check if invoice already exists
      const existingInvoice = await Invoice.findByOrderId(orderId);
      if (existingInvoice) {
        return {
          invoice: existingInvoice,
          message: 'Invoice already exists'
        };
      }

      // Fetch complete order details with populated data
      const order = await Order.findById(orderId)
        .populate('user', 'name email phone')
        .populate('items.product', 'name description price weight metalType purity images hsnCode gistRate')
        .lean();

      if (!order) {
        throw ApiError.notFound('Order not found');
      }

      // Fetch admin details for the footer
      let adminName = 'System';
      if (adminId) {
        const admin = await User.findById(adminId).select('name').lean();
        if (admin) adminName = admin.name;
      }

      // Validate order data
      if (!order.user || !order.user._id) {
        throw ApiError.badRequest('Order has no associated user');
      }

      if (!order.items || order.items.length === 0) {
        throw ApiError.badRequest('Order has no items');
      }

      // Fetch user details for shipping address
      const user = await User.findById(order.user._id).select('addresses').lean();

      // Find shipping address
      const shippingAddress = this._getShippingAddress(user, order);

      // Prepare data for EJS
      const amountInWords = this._numberToWords(order.total || 0);

      // Generate a unique invoice number (temporary for PDF rendering)
      const invoiceNumber = await this._generateUniqueInvoiceNumber();
      const issueDate = new Date();

      // Generate PDF using Puppeteer and EJS
      const startTime = Date.now();
      const pdfResult = await this._createPDF({
        order,
        shippingAddress,
        adminName,
        amountInWords,
        invoice: { invoiceNumber, issueDate }
      });
      const generationTime = Date.now() - startTime;

      // Set filePath for cleanup if needed
      filePath = pdfResult.filePath;

      // Set dates
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

      // Create invoice with ALL required fields
      const invoiceData = {
        invoiceNumber,
        order: orderId,
        user: order.user._id,
        issueDate,
        dueDate,
        subtotal: order.subtotal || 0,
        taxAmount: order.tax || 0,
        shippingAmount: order.shippingCost || 0,
        discountAmount: order.discount || 0,
        totalAmount: order.total || 0,
        paymentStatus: order.paymentStatus || 'pending',
        filePath,
        fileName: pdfResult.fileName,
        fileSize: pdfResult.fileSize,
        status: 'generated',
        metadata: {
          generatedBy: adminId,
          generationTime,
          pdfVersion: '2.0 (Puppeteer)',
          orderTotal: order.total,
          itemsCount: order.items.length
        }
      };

      // Create the invoice
      const invoice = await Invoice.create(invoiceData);

      return {
        success: true,
        invoice: {
          ...invoice.toObject(),
          downloadUrl: invoice.downloadUrl
        },
        message: 'Invoice generated successfully',
        metadata: {
          generationTime,
          fileSize: pdfResult.fileSize,
          pageCount: pdfResult.pageCount || 1
        }
      };

    } catch (error) {
      console.error('Invoice generation error:', error);

      // Clean up created file if invoice creation failed
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkError) {
          console.error('Failed to cleanup invoice file:', unlinkError);
        }
      }

      if (error instanceof ApiError) throw error;
      throw ApiError.internal('Failed to generate invoice: ' + error.message);
    }
  }

  /**
   * Generate unique invoice number
   * @private
   */
  async _generateUniqueInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    // Try up to 5 times to get a unique invoice number
    for (let i = 0; i < 5; i++) {
      const sequence = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const invoiceNumber = `INV-${year}${month}-${sequence}`;

      const exists = await Invoice.findOne({ invoiceNumber });
      if (!exists) {
        return invoiceNumber;
      }
    }

    const timestamp = Date.now().toString().slice(-8);
    return `INV-${year}${month}-${timestamp}`;
  }

  /**
   * Get shipping address with fallbacks
   * @private
   */
  _getShippingAddress(user, order) {
    if (user && user.addresses && user.addresses.length > 0) {
      return user.addresses.find(addr => addr.isDefault) || user.addresses[0];
    }

    if (order.shippingAddress) {
      return order.shippingAddress;
    }

    return {
      addressLine1: 'Address not specified',
      city: 'N/A',
      state: 'N/A',
      pincode: 'N/A',
      phone: order.user?.phone || 'N/A'
    };
  }

  /**
   * Create PDF document using Puppeteer and EJS template
   * @private
   */
  async _createPDF(data) {
    let browser;
    try {
      const templatePath = path.join(__dirname, '../../templates/invoice.ejs');
      const html = await ejs.renderFile(templatePath, data);

      const uploadDir = path.join(__dirname, '../../uploads/invoices');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
      }

      const timestamp = Date.now();
      const orderIdShort = data.order._id.toString().slice(-8);
      const fileName = `invoice_${orderIdShort}_${timestamp}.pdf`;
      const filePath = path.join(uploadDir, fileName);

      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          bottom: '20px',
          left: '20px',
          right: '20px'
        }
      });

      const stats = fs.statSync(filePath);

      return {
        filePath,
        fileName,
        fileSize: stats.size
      };
    } catch (error) {
      console.error('Puppeteer/EJS PDF Error:', error);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Convert number to words (Indian numbering system)
   * @private
   */
  _numberToWords(num) {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (n) => {
      if ((n = n.toString()).length > 9) return 'overflow';
      const nArray = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
      if (!nArray) return '';
      let str = '';
      str += nArray[1] != 0 ? (a[Number(nArray[1])] || b[nArray[1][0]] + ' ' + a[nArray[1][1]]) + 'Crore ' : '';
      str += nArray[2] != 0 ? (a[Number(nArray[2])] || b[nArray[2][0]] + ' ' + a[nArray[2][1]]) + 'Lakh ' : '';
      str += nArray[3] != 0 ? (a[Number(nArray[3])] || b[nArray[3][0]] + ' ' + a[nArray[3][1]]) + 'Thousand ' : '';
      str += nArray[4] != 0 ? (a[Number(nArray[4])] || b[nArray[4][0]] + ' ' + a[nArray[4][1]]) + 'Hundred ' : '';
      str += nArray[5] != 0 ? ((str != '') ? 'and ' : '') + (a[Number(nArray[5])] || b[nArray[5][0]] + ' ' + a[nArray[5][1]]) : '';
      return str.trim();
    };

    const [rupees, paise] = num.toString().split('.');
    let result = inWords(parseInt(rupees)) + ' Rupees Only';

    if (paise && parseInt(paise) > 0) {
      result = inWords(parseInt(rupees)) + ' Rupees and ' + inWords(parseInt(paise)) + ' Paise Only';
    }

    return result;
  }

  /**
   * Download invoice
   * @param {string} invoiceId - Invoice ID
   * @returns {Promise<Object>} File stream and info
   */
  async downloadInvoice(invoiceId) {
    try {
      const invoice = await Invoice.findById(invoiceId);

      if (!invoice) {
        throw ApiError.notFound('Invoice not found');
      }

      if (!fs.existsSync(invoice.filePath)) {
        throw ApiError.notFound('Invoice file not found. Please regenerate.');
      }

      const stats = fs.statSync(invoice.filePath);

      return {
        filePath: invoice.filePath,
        fileName: invoice.fileName || `invoice_${invoice.invoiceNumber}.pdf`,
        contentType: 'application/pdf',
        contentLength: stats.size
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.internal('Failed to download invoice');
    }
  }

  /**
   * Get all invoices with pagination
   */
  async getAllInvoices(filters = {}, options = {}) {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const query = {};

    if (filters.status) query.status = filters.status;
    if (filters.userId) query.user = filters.userId;
    if (filters.orderId) query.order = filters.orderId;

    try {
      const [invoices, total] = await Promise.all([
        Invoice.find(query)
          .populate('order', 'orderNumber total status')
          .populate('user', 'name email')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Invoice.countDocuments(query)
      ]);

      return {
        invoices,
        page: parseInt(page),
        total,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw ApiError.internal('Failed to fetch invoices');
    }
  }

  /**
   * Delete invoice
   */
  async deleteInvoice(invoiceId) {
    try {
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) throw ApiError.notFound('Invoice not found');

      if (fs.existsSync(invoice.filePath)) {
        fs.unlinkSync(invoice.filePath);
      }

      await Invoice.findByIdAndDelete(invoiceId);
      return { success: true };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.internal('Failed to delete invoice');
    }
  }

  /**
   * Get invoice statistics
   */
  async getInvoiceStats() {
    try {
      const [totalInvoices, totalRevenue] = await Promise.all([
        Invoice.countDocuments(),
        Invoice.aggregate([{ $group: { _id: null, total: { $sum: '$totalAmount' } } }])
      ]);

      return {
        totalInvoices,
        totalRevenue: totalRevenue[0]?.total || 0
      };
    } catch (error) {
      throw ApiError.internal('Failed to get invoice statistics');
    }
  }
}

module.exports = new InvoiceService();