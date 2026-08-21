/**
 * Reusable Email Templates for CarbonSmith Jobs
 */

const generateEmployeeWelcomeEmail = (employee, password, loginUrl) => {
  const subject = 'Welcome to CarbonSmith - Your Account Details';
  
  const text = `Hello ${employee.name},\n\nYour employee account has been successfully created.\n\nRole: ${employee.role}\nEmail: ${employee.email}\nPassword: ${password}\n\nYou can log in at: ${loginUrl}\n\nBest regards,\nCarbonSmith Operations Team`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #333; text-align: center;">Welcome to CarbonSmith!</h2>
      <p style="font-size: 16px; color: #555;">Hello <strong>${employee.name}</strong>,</p>
      <p style="font-size: 16px; color: #555;">Your employee account has been successfully created. Here are your credentials:</p>
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <ul style="list-style-type: none; padding: 0; margin: 0;">
          <li style="margin-bottom: 10px;"><strong>Role:</strong> ${employee.role}</li>
          <li style="margin-bottom: 10px;"><strong>Email:</strong> ${employee.email}</li>
          <li><strong>Password:</strong> ${password}</li>
        </ul>
      </div>
      <p style="font-size: 16px; color: #555;">You can log in to the POS dashboard here:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Login to POS</a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="font-size: 14px; color: #888; text-align: center;">Best regards,<br/>CarbonSmith Operations Team</p>
    </div>
  `;

  return { subject, text, html };
};

const generateOrderConfirmationEmail = (order, user) => {
  const orderId = order.orderNumber || order.id;
  const customerName = user?.name || order.shippingAddress?.name || 'Valued Customer';
  const subject = `Thank You for Your Order! - #${orderId}`;
  
  const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

  const address = order.shippingAddress || {};
  const orderDate = new Date(order.createdAt || new Date()).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  const estimatedDelivery = new Date(order.createdAt || new Date());
  estimatedDelivery.setDate(estimatedDelivery.getDate() + 7);
  const deliveryDateStr = estimatedDelivery.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

  let itemsText = '';
  let itemsHtml = '';
  (order.items || []).forEach(item => {
      const pName = item.name || item.product?.name || 'Jewelry Item';
      const qty = item.quantity || 1;
      const price = item.price || item.product?.price || 0;
      const total = price * qty;
      
      itemsText += `${pName}\nQuantity: ${qty}\nPrice: ${formatCurrency(price)}\nTotal: ${formatCurrency(total)}\n\n`;
      
      itemsHtml += `
        <div style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
          <h4 style="margin: 0 0 5px 0; color: #333;">${pName}</h4>
          <p style="margin: 0; color: #555; font-size: 14px;">Quantity: ${qty} <span style="float:right;">Price: ${formatCurrency(price)}</span></p>
          <p style="margin: 5px 0 0 0; color: #000; font-weight: bold; text-align: right;">Total: ${formatCurrency(total)}</p>
        </div>
      `;
  });

  const text = `Thank You for Your Order! \n\nDear ${customerName},\n\nThank you for choosing Carbon Smith. We’re delighted to confirm that your order has been received successfully.\n\nOrder Details\nOrder ID: ${orderId}\nOrder Date: ${orderDate}\nPayment Status: ${order.paymentStatus || 'PENDING'}\nPayment Method: ${order.paymentMethod || 'COD'}\nOrder Status: ${order.orderStatus || 'Processing'}\n\nYour Products\n${itemsText}\nOrder Summary\nSubtotal: ${formatCurrency(order.subTotal || 0)}\nDiscount: -${formatCurrency(order.discount || 0)}\nShipping: ${formatCurrency(order.shippingCost || 0)}\nTax: ${formatCurrency(order.taxTotal || 0)}\nGrand Total: ${formatCurrency(order.grandTotal || order.subTotal || 0)}\n\nDelivery Address\n${customerName}\n${address.addressLine1 || ''}\n${address.addressLine2 ? address.addressLine2 + '\n' : ''}${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}\n${address.country || 'India'}\nPhone: ${address.phone || user?.phone || ''}\n\nDelivery Information\nEstimated Delivery: ${deliveryDateStr}\n\nWe’ll keep you updated throughout the delivery process. Once your order is shipped, you’ll receive another notification with your tracking details.\n\nThank you for trusting Carbon Smith. Every piece is prepared with care, and we’re excited for you to receive your order. \n\nIf you have any questions regarding your order, our support team is happy to help.\n\nNeed Help?\nCall Us: +91 72-18528566\nEmail Us: Support@thecarbonsmith.com\nWebsite: www.thecarbonsmith.com\n\nThank you for choosing Carbon Smith.\n\nWarm regards,\nTeam Carbon Smith\nCarbon Smith Private Limited\nCrafted with Elegance. Made to Last. `;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="color: #000;">Thank You for Your Order! </h2>
      </div>
      
      <p>Dear <strong>${customerName}</strong>,</p>
      <p>Thank you for choosing Carbon Smith. We’re delighted to confirm that your order has been received successfully.</p>
      
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 25px 0;">
        <h3 style="margin-top: 0; color: #000; border-bottom: 2px solid #ddd; padding-bottom: 5px;">Order Details</h3>
        <table style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 4px 0; color: #555;">Order ID:</td><td style="text-align: right; font-weight: bold;">${orderId}</td></tr>
          <tr><td style="padding: 4px 0; color: #555;">Order Date:</td><td style="text-align: right; font-weight: bold;">${orderDate}</td></tr>
          <tr><td style="padding: 4px 0; color: #555;">Payment Status:</td><td style="text-align: right; font-weight: bold;">${order.paymentStatus || 'PENDING'}</td></tr>
          <tr><td style="padding: 4px 0; color: #555;">Payment Method:</td><td style="text-align: right; font-weight: bold;">${order.paymentMethod || 'COD'}</td></tr>
          <tr><td style="padding: 4px 0; color: #555;">Order Status:</td><td style="text-align: right; font-weight: bold; color: #48C9B0;">${order.orderStatus || 'Processing'}</td></tr>
        </table>
      </div>

      <h3 style="color: #000; border-bottom: 2px solid #eee; padding-bottom: 5px;">Your Products</h3>
      <div style="margin-bottom: 25px;">
        ${itemsHtml}
      </div>

      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 25px 0;">
        <h3 style="margin-top: 0; color: #000; border-bottom: 2px solid #ddd; padding-bottom: 5px;">Order Summary</h3>
        <table style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 4px 0; color: #555;">Subtotal:</td><td style="text-align: right;">${formatCurrency(order.subTotal || 0)}</td></tr>
          <tr><td style="padding: 4px 0; color: #555;">Discount:</td><td style="text-align: right; color: #e74c3c;">-${formatCurrency(order.discount || 0)}</td></tr>
          <tr><td style="padding: 4px 0; color: #555;">Shipping:</td><td style="text-align: right;">${formatCurrency(order.shippingCost || 0)}</td></tr>
          <tr><td style="padding: 4px 0; color: #555;">Tax:</td><td style="text-align: right;">${formatCurrency(order.taxTotal || 0)}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; font-size: 16px; border-top: 1px solid #ddd;">Grand Total:</td><td style="text-align: right; font-weight: bold; font-size: 16px; border-top: 1px solid #ddd;">${formatCurrency(order.grandTotal || order.subTotal || 0)}</td></tr>
        </table>
      </div>

      <div style="margin: 25px 0;">
        <h3 style="color: #000; border-bottom: 2px solid #eee; padding-bottom: 5px;">Delivery Address</h3>
        <p style="margin: 5px 0; color: #555;">
          <strong>${customerName}</strong><br/>
          ${address.addressLine1 || ''}<br/>
          ${address.addressLine2 ? address.addressLine2 + '<br/>' : ''}
          ${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}<br/>
          ${address.country || 'India'}<br/>
          <strong>Phone:</strong> ${address.phone || user?.phone || ''}
        </p>
      </div>

      <div style="background-color: #e8f8f5; padding: 15px; border-radius: 5px; margin: 25px 0;">
        <h3 style="margin-top: 0; color: #000;">Delivery Information</h3>
        <p style="margin: 5px 0; color: #2c3e50; font-weight: bold;">Estimated Delivery: ${deliveryDateStr}</p>
        <p style="margin: 10px 0 0 0; font-size: 14px; color: #555;">We’ll keep you updated throughout the delivery process. Once your order is shipped, you’ll receive another notification with your tracking details.</p>
      </div>

      <p style="margin: 25px 0;">Thank you for trusting Carbon Smith. Every piece is prepared with care, and we’re excited for you to receive your order. </p>
      <p>If you have any questions regarding your order, our support team is happy to help.</p>

      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 25px 0;">
        <h3 style="margin-top: 0; color: #000; border-bottom: 2px solid #ddd; padding-bottom: 5px;">Need Help?</h3>
        <p style="margin: 5px 0; color: #555;"><strong>Call Us:</strong> +91 72-18528566</p>
        <p style="margin: 5px 0; color: #555;"><strong>Email Us:</strong> <a href="mailto:Support@thecarbonsmith.com" style="color: #48C9B0;">Support@thecarbonsmith.com</a></p>
        <p style="margin: 5px 0; color: #555;"><strong>Website:</strong> <a href="http://www.thecarbonsmith.com/" style="color: #48C9B0;">www.thecarbonsmith.com</a></p>
      </div>

      <div style="margin-top: 40px; text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #000;">Thank you for choosing Carbon Smith.</p>
        <p style="margin: 0; color: #555;">Warm regards,</p>
        <p style="margin: 5px 0; font-weight: bold; color: #000;">Team Carbon Smith</p>
        <p style="margin: 5px 0; font-size: 14px; color: #888;">Carbon Smith Private Limited<br/>Crafted with Elegance. Made to Last. </p>
      </div>
    </div>
  `;

  return { subject, text, html };
};

const generateInvoiceEmail = (invoice, order, user) => {
  const customerName = user?.name || order?.shippingAddress?.name || 'Valued Customer';
  const subject = `Your Invoice - #${invoice.invoiceNumber}`;
  
  const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

  const itemsHtml = (invoice.items || []).map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <span style="font-weight: bold; color: #333;">${item.name || 'Jewelry Item'}</span><br/>
        <span style="font-size: 12px; color: #888;">Qty: ${item.quantity}</span>
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; color: #333;">
        ${formatCurrency(item.total)}
      </td>
    </tr>
  `).join('');

  const text = `Hi ${customerName},\n\nYour invoice #${invoice.invoiceNumber} has been generated. Total amount: ${formatCurrency(invoice.total)}.\n\nThank you for choosing CarbonSmith!`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px;">
        <h1 style="color: #333; margin: 0;">CarbonSmith</h1>
        <p style="color: #777; margin: 5px 0 0 0; font-size: 14px;">Invoice Receipt</p>
      </div>
      
      <p style="font-size: 16px; color: #555;">Hi <strong>${customerName}</strong>,</p>
      <p style="font-size: 16px; color: #555; line-height: 1.5;">Thank you for your business. Please find the details of your recent invoice below:</p>
      
      <div style="margin: 20px 0;">
        <p style="margin: 0 0 5px 0; font-weight: bold; color: #333;">Invoice ID: <span style="font-weight: normal; color: #555;">${invoice.invoiceNumber}</span></p>
        <p style="margin: 0 0 15px 0; font-weight: bold; color: #333;">Date: <span style="font-weight: normal; color: #555;">${new Date(invoice.issueDate).toLocaleDateString('en-IN')}</span></p>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 10px; border-bottom: 2px solid #eee; color: #333;">Description</th>
              <th style="text-align: right; padding: 10px; border-bottom: 2px solid #eee; color: #333;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td style="padding: 10px; text-align: right; color: #555; font-size: 14px;">Subtotal:</td>
              <td style="padding: 10px; text-align: right; color: #333;">${formatCurrency(invoice.subtotal)}</td>
            </tr>
            <tr>
              <td style="padding: 10px; text-align: right; color: #555; font-size: 14px;">Tax:</td>
              <td style="padding: 10px; text-align: right; color: #333;">${formatCurrency(invoice.tax)}</td>
            </tr>
            <tr>
              <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 16px; color: #333; border-top: 2px solid #eee;">Total:</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 16px; color: #333; border-top: 2px solid #eee;">${formatCurrency(invoice.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="font-size: 14px; color: #888; text-align: center;">If you have any questions about this invoice, please reply to this email or contact us at support@thecarbonsmith.com</p>
      <p style="font-size: 14px; color: #888; text-align: center; margin-top: 5px;">Best regards,<br/>The CarbonSmith Team</p>
    </div>
  `;

  return { subject, text, html };
};

const generatePOSBillEmail = (posOrder, customerName) => {
  const subject = `Your Purchase Receipt - #${posOrder.orderId}`;
  
  const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

  const itemsHtml = (posOrder.items || []).map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <span style="font-weight: bold; color: #333;">${item.productName || 'Jewelry Item'}</span><br/>
        <span style="font-size: 12px; color: #888;">Qty: ${item.quantity}</span>
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; color: #333;">
        ${formatCurrency(item.price)}
      </td>
    </tr>
  `).join('');

  const text = `Hi ${customerName},\n\nThank you for shopping at CarbonSmith. Your order #${posOrder.orderId} total is ${formatCurrency(posOrder.grandTotal)}.\n\nSee you again soon!`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px;">
        <h1 style="color: #333; margin: 0;">CarbonSmith</h1>
        <p style="color: #777; margin: 5px 0 0 0; font-size: 14px;">Store Receipt</p>
      </div>
      
      <p style="font-size: 16px; color: #555;">Hi <strong>${customerName}</strong>,</p>
      <p style="font-size: 16px; color: #555; line-height: 1.5;">Thank you for shopping with us today. Here is a copy of your receipt:</p>
      
      <div style="margin: 20px 0;">
        <p style="margin: 0 0 5px 0; font-weight: bold; color: #333;">Receipt No: <span style="font-weight: normal; color: #555;">${posOrder.orderId}</span></p>
        <p style="margin: 0 0 15px 0; font-weight: bold; color: #333;">Date: <span style="font-weight: normal; color: #555;">${new Date(posOrder.createdAt).toLocaleString('en-IN')}</span></p>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 10px; border-bottom: 2px solid #eee; color: #333;">Item</th>
              <th style="text-align: right; padding: 10px; border-bottom: 2px solid #eee; color: #333;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td style="padding: 10px; text-align: right; color: #555; font-size: 14px;">Subtotal:</td>
              <td style="padding: 10px; text-align: right; color: #333;">${formatCurrency(posOrder.subTotal)}</td>
            </tr>
            <tr>
              <td style="padding: 10px; text-align: right; color: #555; font-size: 14px;">Tax/GST:</td>
              <td style="padding: 10px; text-align: right; color: #333;">${formatCurrency(posOrder.totalGST)}</td>
            </tr>
            ${posOrder.discountAmount > 0 ? `
            <tr>
              <td style="padding: 10px; text-align: right; color: #555; font-size: 14px;">Discount:</td>
              <td style="padding: 10px; text-align: right; color: green;">-${formatCurrency(posOrder.discountAmount)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 16px; color: #333; border-top: 2px solid #eee;">Total Paid:</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 16px; color: #333; border-top: 2px solid #eee;">${formatCurrency(posOrder.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="font-size: 14px; color: #888; text-align: center;">We hope to see you again soon!</p>
      <p style="font-size: 14px; color: #888; text-align: center; margin-top: 5px;">Best regards,<br/>The CarbonSmith Team</p>
    </div>
  `;

  return { subject, text, html };
};

module.exports = {
  generateEmployeeWelcomeEmail,
  generateOrderConfirmationEmail,
  generateInvoiceEmail,
  generatePOSBillEmail
};

