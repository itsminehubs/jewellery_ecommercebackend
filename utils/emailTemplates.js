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
  // Use order._id as fallback if orderId isn't explicitly set
  const orderId = order.orderId || order._id;
  const customerName = user?.name || order.shippingAddress?.name || 'Valued Customer';
  const subject = `Order Confirmation - #${orderId}`;
  
  // Format currency helper
  const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

  // Generate table rows for items
  const itemsHtml = (order.items || []).map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <span style="font-weight: bold; color: #333;">${item.name || 'Jewelry Item'}</span><br/>
        <span style="font-size: 12px; color: #888;">Qty: ${item.quantity}</span>
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; color: #333;">
        ${formatCurrency(item.price)}
      </td>
    </tr>
  `).join('');

  const shippingHtml = order.shippingAddress ? `
    <div style="margin-top: 20px; padding: 15px; background-color: #f9f9f9; border-radius: 5px;">
      <h3 style="margin-top: 0; color: #333; font-size: 16px;">Shipping Address</h3>
      <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.5;">
        <strong>${order.shippingAddress.name}</strong><br/>
        ${order.shippingAddress.addressLine1} ${order.shippingAddress.addressLine2 ? ', ' + order.shippingAddress.addressLine2 : ''}<br/>
        ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}<br/>
        Ph: ${order.shippingAddress.phone}
      </p>
    </div>
  ` : '';

  const text = `Thank you for your order, ${customerName}!\n\nYour order #${orderId} has been confirmed. Total amount: ${formatCurrency(order.total)}.\n\nThank you for shopping with CarbonSmith!`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px;">
        <h1 style="color: #333; margin: 0;">CarbonSmith</h1>
        <p style="color: #777; margin: 5px 0 0 0; font-size: 14px;">Order Confirmation</p>
      </div>
      
      <p style="font-size: 16px; color: #555;">Hi <strong>${customerName}</strong>,</p>
      <p style="font-size: 16px; color: #555; line-height: 1.5;">Thank you for your order! We've received it and are getting it ready for you. Below are your order details:</p>
      
      <div style="margin: 20px 0;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">Order ID: <span style="font-weight: normal; color: #555;">#${orderId}</span></p>
        
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
              <td style="padding: 10px; text-align: right; color: #333;">${formatCurrency(order.subtotal)}</td>
            </tr>
            <tr>
              <td style="padding: 10px; text-align: right; color: #555; font-size: 14px;">Tax:</td>
              <td style="padding: 10px; text-align: right; color: #333;">${formatCurrency(order.tax)}</td>
            </tr>
            ${order.shippingCost > 0 ? `
            <tr>
              <td style="padding: 10px; text-align: right; color: #555; font-size: 14px;">Shipping:</td>
              <td style="padding: 10px; text-align: right; color: #333;">${formatCurrency(order.shippingCost)}</td>
            </tr>` : ''}
            ${order.discount > 0 ? `
            <tr>
              <td style="padding: 10px; text-align: right; color: #555; font-size: 14px;">Discount:</td>
              <td style="padding: 10px; text-align: right; color: green;">-${formatCurrency(order.discount)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 16px; color: #333; border-top: 2px solid #eee;">Total:</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 16px; color: #333; border-top: 2px solid #eee;">${formatCurrency(order.total)}</td>
            </tr>
          </tfoot>
        </table>
        
        ${shippingHtml}
      </div>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="font-size: 14px; color: #888; text-align: center;">If you have any questions about your order, please reply to this email or contact us at support@thecarbonsmith.com</p>
      <p style="font-size: 14px; color: #888; text-align: center; margin-top: 5px;">Best regards,<br/>The CarbonSmith Team</p>
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
