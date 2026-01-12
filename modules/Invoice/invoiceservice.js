const Order = require('../order/order.model');
const User = require('../user/user.model');
const Invoice = require('./invoicemodel');
const PDFDocument = require('pdfkit');
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
        .populate('items.product', 'name description price weight metalType purity images')
        .lean();

      if (!order) {
        throw ApiError.notFound('Order not found');
      }

      // Validate order data
      if (!order.user || !order.user._id) {
        throw ApiError.badRequest('Order has no associated user');
      }
      
      if (!order.items || order.items.length === 0) {
        throw ApiError.badRequest('Order has no items');
      }
      
      if (typeof order.total !== 'number' || order.total <= 0) {
        throw ApiError.badRequest('Invalid order total');
      }

      // Fetch user details for shipping address
      const user = await User.findById(order.user._id).select('addresses').lean();

      // Find shipping address
      const shippingAddress = this._getShippingAddress(user, order);

      // Generate PDF
      const startTime = Date.now();
      const pdfResult = await this._createPDF(order, shippingAddress, adminId);
      const generationTime = Date.now() - startTime;

      // Set filePath for cleanup if needed
      filePath = pdfResult.filePath;

      // Generate a unique invoice number
      const invoiceNumber = await this._generateUniqueInvoiceNumber();
      
      // Set dates
      const issueDate = new Date();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

      // Create invoice with ALL required fields
      const invoiceData = {
        invoiceNumber: invoiceNumber,
        order: orderId,
        user: order.user._id,
        issueDate: issueDate,
        dueDate: dueDate,
        subtotal: order.subtotal || 0,
        taxAmount: order.tax || 0,
        shippingAmount: order.shippingCost || 0,
        discountAmount: order.discount || 0,
        totalAmount: order.total || 0,
        paymentStatus: order.paymentStatus || 'pending',
        filePath: filePath,
        fileName: pdfResult.fileName,
        fileSize: pdfResult.fileSize,
        status: 'generated',
        metadata: {
          generatedBy: adminId,
          generationTime: generationTime,
          pdfVersion: '1.0',
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
          generationTime: generationTime,
          fileSize: pdfResult.fileSize,
          pageCount: pdfResult.pageCount
        }
      };
      
    } catch (error) {
      console.error('Invoice generation error:', error);
      
      // Clean up created file if invoice creation failed
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log('Cleaned up orphaned invoice file:', filePath);
        } catch (unlinkError) {
          console.error('Failed to cleanup invoice file:', unlinkError);
        }
      }
      
      // Handle specific error types
      if (error.code === 11000) {
        throw ApiError.conflict('Invoice number already exists. Please try again.');
      }
      
      if (error.name === 'ValidationError') {
        const validationErrors = {};
        for (const field in error.errors) {
          validationErrors[field] = error.errors[field].message;
        }
        throw ApiError.badRequest('Invoice validation failed', validationErrors);
      }
      
      if (error instanceof ApiError) {
        throw error;
      }
      
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
    
    // Fallback: timestamp-based
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
    
    // Return minimal address object
    return {
      addressLine1: 'Address not specified',
      city: 'N/A',
      state: 'N/A',
      pincode: 'N/A',
      phone: order.user?.phone || 'N/A'
    };
  }

  /**
   * Create PDF document
   * @private
   */
  async _createPDF(order, shippingAddress, adminId) {
    return new Promise((resolve, reject) => {
      let filePath;
      let writeStream;
      
      try {
        // Create uploads directory with proper structure
        const uploadDir = path.join(__dirname, '../../uploads/invoices');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
        }

        // Generate unique filename with timestamp and order ID
        const timestamp = Date.now();
        const orderIdShort = order._id.toString().slice(-8);
        const fileName = `invoice_${orderIdShort}_${timestamp}.pdf`;
        filePath = path.join(uploadDir, fileName);
        
        // Create write stream
        writeStream = fs.createWriteStream(filePath);
        
        // Create PDF document with configuration
        const doc = new PDFDocument({ 
          size: 'A4', 
          margin: 50,
          bufferPages: true,
          info: {
            Title: `Invoice - Order ${orderIdShort}`,
            Author: 'Golden Jewels Pvt. Ltd.',
            Subject: 'Commercial Invoice',
            Keywords: 'invoice, receipt, order, jewelry, bill',
            Creator: 'Golden Jewels E-commerce System',
            CreationDate: new Date(),
            Producer: 'PDFKit',
            ModDate: new Date()
          }
        });

        // Pipe PDF to file
        doc.pipe(writeStream);

        // Add company header
        this._addHeader(doc);

        // Add invoice info
        this._addInvoiceInfo(doc, order);

        // Add company and customer info
        this._addCompanyInfo(doc);
        this._addCustomerInfo(doc, order.user, shippingAddress);

        // Add order items table
        const tableEndY = this._addItemsTable(doc, order.items);

        // Add totals
        this._addTotals(doc, order, tableEndY);

        // Add payment and notes
        this._addPaymentInfo(doc, order);
        this._addFooter(doc, order, adminId);

        // Handle write stream events
        writeStream.on('finish', () => {
          try {
            // Get file stats for size
            const stats = fs.statSync(filePath);
            
            if (stats.size === 0) {
              // Empty file - delete it and reject
              fs.unlinkSync(filePath);
              reject(new Error('Generated PDF file is empty'));
              return;
            }
            
            resolve({
              filePath: filePath,
              fileName: fileName,
              fileSize: stats.size,
              pageCount: doc.bufferedPageRange().count || 1
            });
          } catch (statsError) {
            reject(new Error(`Failed to get file stats: ${statsError.message}`));
          }
        });

        writeStream.on('error', (writeError) => {
          reject(new Error(`File write error: ${writeError.message}`));
        });

        doc.on('error', (pdfError) => {
          reject(new Error(`PDF generation error: ${pdfError.message}`));
        });

        // End the document
        doc.end();

      } catch (error) {
        // Clean up if file was created but error occurred
        if (filePath && fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (cleanupError) {
            console.error('Failed to cleanup file:', cleanupError);
          }
        }
        
        // Close write stream if it exists
        if (writeStream) {
          try {
            writeStream.end();
          } catch (streamError) {
            // Ignore stream closing errors
          }
        }
        
        reject(new Error(`Failed to create PDF: ${error.message}`));
      }
    });
  }

  /**
   * Add company header
   * @private
   */
  _addHeader(doc) {
    try {
      // Company logo and name
      doc.fontSize(24).font('Helvetica-Bold').fillColor('#2c3e50');
      doc.text('GOLDEN JEWELS', 50, 50);
      
      doc.fontSize(10).font('Helvetica').fillColor('#7f8c8d');
      doc.text('Premium Jewelry Since 1995', 50, 80);
      
      // Separator line
      doc.moveTo(50, 100).lineTo(550, 100).strokeColor('#e74c3c').lineWidth(2).stroke();
    } catch (error) {
      console.error('Error in _addHeader:', error);
      throw error;
    }
  }

  /**
   * Add invoice information
   * @private
   */
  _addInvoiceInfo(doc, order) {
    try {
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#2c3e50');
      doc.text('INVOICE', 400, 50, { align: 'right' });
      
      doc.fontSize(10).font('Helvetica').fillColor('#7f8c8d');
      doc.text(`Invoice Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, 400, 80, { align: 'right' });
      doc.text(`Order #: ${order.orderNumber || order._id.toString().substring(0, 8)}`, 400, 95, { align: 'right' });
      doc.text(`Status: ${(order.status || '').toUpperCase()}`, 400, 110, { align: 'right' });
    } catch (error) {
      console.error('Error in _addInvoiceInfo:', error);
      throw error;
    }
  }

  /**
   * Add company information
   * @private
   */
  _addCompanyInfo(doc) {
    try {
      const companyInfo = {
        name: 'Golden Jewels Pvt. Ltd.',
        address: '123 Diamond Street, Jewelry District',
        city: 'Mumbai, Maharashtra 400001',
        phone: '+91 22 1234 5678',
        email: 'billing@goldenjewels.com',
        gstin: '27AABCU9603R1ZX',
        website: 'www.goldenjewels.com'
      };

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2c3e50');
      doc.text('BILL FROM:', 50, 130);
      
      doc.fontSize(9).font('Helvetica').fillColor('#34495e');
      doc.text(companyInfo.name, 50, 150);
      doc.text(companyInfo.address, 50, 165);
      doc.text(companyInfo.city, 50, 180);
      doc.text(`Phone: ${companyInfo.phone}`, 50, 195);
      doc.text(`Email: ${companyInfo.email}`, 50, 210);
      doc.text(`GSTIN: ${companyInfo.gstin}`, 50, 225);
      doc.text(`Website: ${companyInfo.website}`, 50, 240);
    } catch (error) {
      console.error('Error in _addCompanyInfo:', error);
      throw error;
    }
  }

  /**
   * Add customer information
   * @private
   */
  _addCustomerInfo(doc, user, shippingAddress) {
    try {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#2c3e50');
      doc.text('BILL TO:', 300, 130);
      
      doc.fontSize(9).font('Helvetica').fillColor('#34495e');
      
      // Customer name
      doc.text(user?.name || 'Customer', 300, 150);
      
      // Address
      if (shippingAddress) {
        let yPos = 165;
        
        if (shippingAddress.addressLine1) {
          doc.text(shippingAddress.addressLine1, 300, yPos);
          yPos += 15;
        }
        
        if (shippingAddress.addressLine2) {
          doc.text(shippingAddress.addressLine2, 300, yPos);
          yPos += 15;
        }
        
        const cityState = [];
        if (shippingAddress.city) cityState.push(shippingAddress.city);
        if (shippingAddress.state) cityState.push(shippingAddress.state);
        if (shippingAddress.pincode) cityState.push(shippingAddress.pincode);
        
        if (cityState.length > 0) {
          doc.text(cityState.join(', '), 300, yPos);
          yPos += 15;
        }
        
        doc.text(`Phone: ${shippingAddress.phone || user?.phone || 'N/A'}`, 300, yPos);
        yPos += 15;
      } else {
        doc.text('Address: Not specified', 300, 165);
        doc.text(`Phone: ${user?.phone || 'N/A'}`, 300, 180);
      }
      
      // Email
      doc.text(`Email: ${user?.email || 'N/A'}`, 300, user && shippingAddress ? 225 : 195);
      
      // Customer ID if available
      if (user?._id) {
        doc.text(`Customer ID: ${user._id.toString().substring(0, 8)}`, 300, user && shippingAddress ? 240 : 210);
      }
    } catch (error) {
      console.error('Error in _addCustomerInfo:', error);
      throw error;
    }
  }

  /**
   * Add items table
   * @private
   */
  _addItemsTable(doc, items) {
    try {
      const startY = 280;
      
      // Table header
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
      doc.rect(50, startY, 500, 20).fill('#2c3e50');
      
      const columns = [
        { x: 50, width: 200, title: 'Description' },
        { x: 250, width: 80, title: 'Metal Type' },
        { x: 330, width: 60, title: 'Weight (g)' },
        { x: 390, width: 70, title: 'Price' },
        { x: 460, width: 50, title: 'Qty' },
        { x: 510, width: 40, title: 'Total' }
      ];
      
      columns.forEach(col => {
        doc.text(col.title, col.x + 5, startY + 5, { width: col.width - 10 });
      });
      
      // Table rows
      let currentY = startY + 25;
      doc.fontSize(9).font('Helvetica').fillColor('#2c3e50');
      
      if (!items || items.length === 0) {
        // No items - show message
        doc.text('No items in this order', 55, currentY);
        currentY += 40;
        return currentY;
      }
      
      items.forEach((item, index) => {
        const product = item.product || {};
        
        // Alternate row colors for readability
        if (index % 2 === 0) {
          doc.rect(50, currentY - 5, 500, 20).fill('#f8f9fa');
        }
        
        // Product name (truncate if too long)
        const productName = product.name || 'Product';
        const displayName = productName.length > 30 
          ? productName.substring(0, 27) + '...' 
          : productName;
        
        doc.fillColor('#2c3e50').text(displayName, 55, currentY, { width: 190 });
        
        // Product details
        doc.text(product.metalType || 'Gold', 250, currentY, { width: 75 });
        doc.text((product.weight || 0).toString(), 330, currentY, { width: 55, align: 'right' });
        doc.text(`₹${(item.price || product.price || 0).toFixed(2)}`, 390, currentY, { width: 65, align: 'right' });
        doc.text((item.quantity || 1).toString(), 460, currentY, { width: 45, align: 'right' });
        
        const itemTotal = (item.price || product.price || 0) * (item.quantity || 1);
        doc.text(`₹${itemTotal.toFixed(2)}`, 510, currentY, { width: 35, align: 'right' });
        
        currentY += 20;
        
        // Check if we need a new page
        if (currentY > 700 && index < items.length - 1) {
          doc.addPage();
          currentY = 50;
          
          // Add table header on new page
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
          doc.rect(50, currentY, 500, 20).fill('#2c3e50');
          
          columns.forEach(col => {
            doc.text(col.title, col.x + 5, currentY + 5, { width: col.width - 10 });
          });
          
          currentY += 25;
          doc.fontSize(9).font('Helvetica').fillColor('#2c3e50');
        }
      });
      
      return currentY + 10;
    } catch (error) {
      console.error('Error in _addItemsTable:', error);
      throw error;
    }
  }

  /**
   * Add totals section
   * @private
   */
  _addTotals(doc, order, startY) {
    try {
      const yStart = startY || 480;
      let currentY = yStart;
      
      doc.fontSize(9).font('Helvetica');
      
      // Subtotal
      doc.text('Subtotal:', 400, currentY, { align: 'right', width: 100 });
      doc.text(`₹${(order.subtotal || 0).toFixed(2)}`, 510, currentY, { align: 'right' });
      currentY += 15;
      
      // Tax
      if (order.tax > 0) {
        const taxRate = order.subtotal > 0 ? (order.tax / order.subtotal * 100).toFixed(1) : '0.0';
        doc.text(`Tax (${taxRate}%):`, 400, currentY, { align: 'right', width: 100 });
        doc.text(`₹${(order.tax || 0).toFixed(2)}`, 510, currentY, { align: 'right' });
        currentY += 15;
      }
      
      // Shipping
      if (order.shippingCost > 0) {
        doc.text('Shipping:', 400, currentY, { align: 'right', width: 100 });
        doc.text(`₹${(order.shippingCost || 0).toFixed(2)}`, 510, currentY, { align: 'right' });
        currentY += 15;
      }
      
      // Discount
      if (order.discount > 0) {
        doc.text('Discount:', 400, currentY, { align: 'right', width: 100 });
        doc.text(`-₹${(order.discount || 0).toFixed(2)}`, 510, currentY, { align: 'right' });
        currentY += 15;
      }
      
      // Total
      doc.font('Helvetica-Bold').fontSize(11);
      doc.text('Total Amount:', 400, currentY, { align: 'right', width: 100 });
      doc.text(`₹${(order.total || 0).toFixed(2)}`, 510, currentY, { align: 'right' });
      currentY += 25;
      
      // Amount in words
      doc.fontSize(8).font('Helvetica').fillColor('#7f8c8d');
      const amountInWords = this._numberToWords(order.total || 0);
      doc.text(`Amount in words: ${amountInWords}`, 50, currentY, { width: 500 });
      
      return currentY + 20;
    } catch (error) {
      console.error('Error in _addTotals:', error);
      throw error;
    }
  }

  /**
   * Add payment information
   * @private
   */
  _addPaymentInfo(doc, order) {
    try {
      const startY = 580;
      
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#2c3e50');
      doc.text('PAYMENT INFORMATION', 50, startY);
      
      doc.fontSize(8).font('Helvetica').fillColor('#34495e');
      doc.text(`Payment Method: ${(order.paymentMethod || 'N/A').toUpperCase()}`, 50, startY + 20);
      doc.text(`Payment Status: ${(order.paymentStatus || 'pending').toUpperCase()}`, 50, startY + 35);
      
      if (order.razorpayPaymentId) {
        doc.text(`Transaction ID: ${order.razorpayPaymentId}`, 50, startY + 50);
      }
      
      if (order.razorpayOrderId) {
        doc.text(`Razorpay Order ID: ${order.razorpayOrderId}`, 50, startY + 65);
      }
      
      return startY + 80;
    } catch (error) {
      console.error('Error in _addPaymentInfo:', error);
      throw error;
    }
  }

  /**
   * Add footer
   * @private
   */
  _addFooter(doc, order, adminId) {
    try {
      const footerY = 660;
      
      // Terms and conditions
      doc.fontSize(8).font('Helvetica').fillColor('#7f8c8d');
      doc.text('Terms & Conditions:', 50, footerY);
      doc.text('1. Goods once sold will not be taken back or exchanged.', 50, footerY + 15, { width: 500 });
      doc.text('2. Make all payments payable to Golden Jewels Pvt. Ltd.', 50, footerY + 30, { width: 500 });
      doc.text('3. This is a computer-generated invoice.', 50, footerY + 45, { width: 500 });
      doc.text('4. All disputes subject to Mumbai jurisdiction.', 50, footerY + 60, { width: 500 });
      
      // Signature
      doc.text('Authorized Signature', 400, footerY + 60, { align: 'center' });
      doc.moveTo(400, footerY + 75).lineTo(480, footerY + 75).stroke();
      
      // Generation info
      doc.fontSize(7).text(`Generated by Admin ID: ${adminId ? adminId.toString().substring(0, 8) : 'System'}`, 50, footerY + 90);
      doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 50, footerY + 100);
      doc.text(`Document ID: ${order._id.toString().substring(0, 8)}`, 50, footerY + 110);
    } catch (error) {
      console.error('Error in _addFooter:', error);
      throw error;
    }
  }

  /**
   * Convert number to words (Indian numbering system)
   * @private
   */
  _numberToWords(num) {
    try {
      if (isNaN(num) || num === 0) {
        return 'Zero Rupees';
      }
      
      const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
      const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
      const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
      
      let result = '';
      let n = Math.abs(num);
      let decimalPart = Math.round((n - Math.floor(n)) * 100);
      
      // Convert integer part
      if (n >= 10000000) { // Crore
        const crore = Math.floor(n / 10000000);
        result += this._convertHundreds(crore) + ' Crore ';
        n %= 10000000;
      }
      
      if (n >= 100000) { // Lakh
        const lakh = Math.floor(n / 100000);
        result += this._convertHundreds(lakh) + ' Lakh ';
        n %= 100000;
      }
      
      if (n >= 1000) { // Thousand
        const thousand = Math.floor(n / 1000);
        result += this._convertHundreds(thousand) + ' Thousand ';
        n %= 1000;
      }
      
      if (n > 0) {
        result += this._convertHundreds(n);
      }
      
      result = result.trim() + ' Rupees';
      
      // Add paise if any
      if (decimalPart > 0) {
        result += ' and ' + this._convertHundreds(decimalPart) + ' Paise';
      }
      
      // Add "Only" at the end
      result += ' Only';
      
      // Capitalize first letter
      return result.charAt(0).toUpperCase() + result.slice(1);
    } catch (error) {
      console.error('Error converting number to words:', error);
      return 'Rupees';
    }
  }

  /**
   * Helper function to convert hundreds
   * @private
   */
  _convertHundreds(n) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    
    let result = '';
    
    if (n >= 100) {
      result += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    
    if (n >= 20) {
      result += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    
    if (n >= 10) {
      result += teens[n - 10] + ' ';
      n = 0;
    }
    
    if (n > 0) {
      result += ones[n] + ' ';
    }
    
    return result.trim();
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
      
      // Check if file exists
      if (!fs.existsSync(invoice.filePath)) {
        console.error(`Invoice file not found: ${invoice.filePath}`);
        throw ApiError.notFound('Invoice file not found. Please regenerate the invoice.');
      }
      
      // Get file stats
      const stats = fs.statSync(invoice.filePath);
      
      if (stats.size === 0) {
        throw ApiError.internal('Invoice file is empty');
      }
      
      return {
        filePath: invoice.filePath,
        fileName: invoice.fileName || `invoice_${invoice.invoiceNumber}.pdf`,
        contentType: 'application/pdf',
        contentLength: stats.size,
        lastModified: stats.mtime,
        etag: `"${stats.size}-${stats.mtime.getTime()}"`
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      console.error('Invoice download error:', error);
      throw ApiError.internal('Failed to download invoice');
    }
  }

  /**
   * Get all invoices with pagination
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Paginated invoices
   */
  async getAllInvoices(filters = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;
    
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    // Build filter query
    const query = {};
    
    if (filters.status) query.status = filters.status;
    if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
    if (filters.userId) query.user = filters.userId;
    if (filters.orderId) query.order = filters.orderId;
    if (filters.invoiceNumber) query.invoiceNumber = { $regex: filters.invoiceNumber, $options: 'i' };
    
    // Date range filters
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        startDate.setHours(0, 0, 0, 0);
        query.createdAt.$gte = startDate;
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }
    
    // Amount range filters
    if (filters.minAmount || filters.maxAmount) {
      query.totalAmount = {};
      if (filters.minAmount) query.totalAmount.$gte = parseFloat(filters.minAmount);
      if (filters.maxAmount) query.totalAmount.$lte = parseFloat(filters.maxAmount);
    }
    
    try {
      const [invoices, total] = await Promise.all([
        Invoice.find(query)
          .populate('order', 'orderNumber total status')
          .populate('user', 'name email')
          .populate('metadata.generatedBy', 'name email')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Invoice.countDocuments(query)
      ]);
      
      const totalPages = Math.ceil(total / limit);
      
      return {
        invoices,
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      };
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
      throw ApiError.internal('Failed to fetch invoices');
    }
  }

  /**
   * Delete invoice
   * @param {string} invoiceId - Invoice ID
   * @returns {Promise<void>}
   */
  async deleteInvoice(invoiceId) {
    try {
      const invoice = await Invoice.findById(invoiceId);
      
      if (!invoice) {
        throw ApiError.notFound('Invoice not found');
      }
      
      // Delete file from filesystem
      if (fs.existsSync(invoice.filePath)) {
        fs.unlinkSync(invoice.filePath);
      }
      
      await Invoice.findByIdAndDelete(invoiceId);
      
      return {
        success: true,
        message: 'Invoice deleted successfully',
        invoiceNumber: invoice.invoiceNumber
      };
    } catch (error) {
      console.error('Invoice deletion error:', error);
      
      if (error instanceof ApiError) {
        throw error;
      }
      
      throw ApiError.internal('Failed to delete invoice');
    }
  }

  /**
   * Get invoice statistics
   * @returns {Promise<Object>} Invoice statistics
   */
  async getInvoiceStats() {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      
      const [
        totalInvoices,
        totalRevenue,
        monthlyInvoices,
        yearlyInvoices,
        byStatus,
        byPaymentStatus
      ] = await Promise.all([
        Invoice.countDocuments(),
        Invoice.aggregate([{ $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
        Invoice.countDocuments({ createdAt: { $gte: startOfMonth } }),
        Invoice.countDocuments({ createdAt: { $gte: startOfYear } }),
        Invoice.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Invoice.aggregate([{ $group: { _id: '$paymentStatus', count: { $sum: 1 } } }])
      ]);
      
      return {
        totalInvoices,
        totalRevenue: totalRevenue[0]?.total || 0,
        monthlyInvoices,
        yearlyInvoices,
        byStatus: byStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byPaymentStatus: byPaymentStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('Failed to get invoice stats:', error);
      throw ApiError.internal('Failed to get invoice statistics');
    }
  }
}

module.exports = new InvoiceService();