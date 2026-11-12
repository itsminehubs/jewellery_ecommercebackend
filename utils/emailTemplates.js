/**
 * Reusable Email Templates for CarbonSmith Jobs & Notifications
 * Formatted with professional luxury branding, comprehensive jewelry specification breakdowns,
 * and high-contrast email client compatibility.
 */

const BRAND_LOGO_URL = 'https://www.thecarbonsmith.com/assets/cslogo3-cIe_cQLB.png';
const BRAND_STORE_ADDRESS = 'Shop No. 7, Kunjir Shyama Prestige, Pimple Saudagar, Pune, Maharashtra 411027';
const BRAND_PHONE = '+91 72-18528566';
const BRAND_LANDLINE = '020-69121427';
const BRAND_EMAIL = 'Support@thecarbonsmith.com';
const BRAND_WEBSITE = 'https://thecarbonsmith.com';

const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (d) => {
  if (!d) return '-';
  const date = new Date(d);
  return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatDateTime = (d) => {
  if (!d) return '-';
  const date = new Date(d);
  return isNaN(date.getTime()) ? '-' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * Normalizes and extracts all jewelry specifications from an order item or product record.
 */
const extractItemDetails = (item) => {
  const p = item.product || {};
  const metal = p.metalDetails || item.metalDetails || {};
  const stones = Array.isArray(p.stoneDetails) ? p.stoneDetails : (Array.isArray(item.stoneDetails) ? item.stoneDetails : []);
  const images = Array.isArray(p.images) ? p.images : (Array.isArray(item.images) ? item.images : []);

  const name = item.name || item.productName || p.name || 'Jewelry Item';
  const sku = item.sku || p.sku || '';
  const tagId = item.tagId || p.tagId || '';
  const huid = item.huid || p.huid || '';
  const hsnCode = item.hsnCode || p.hsnCode || '7113';

  // Metal & Purity
  const metalType = metal.metalType || item.metalType || 'Gold';
  const purity = metal.purity || item.purity || '22K';
  const metalColor = metal.metalColor || item.metalColor || '';
  const metalPurityDisplay = `${purity} ${metalColor ? metalColor + ' ' : ''}${metalType}`.trim();

  // Weights
  const grossWeight = Number(metal.grossWeight || item.grossWeight || item.grossWt || item.weight || 0);
  const netWeight = Number(metal.netWeight || item.netWeight || item.netWt || (grossWeight > 0 ? grossWeight : 0));

  // Stones
  let totalStoneCarat = 0;
  let totalStoneWeight = 0;
  let stoneTypes = [];
  stones.forEach(s => {
    if (s.carat) totalStoneCarat += Number(s.carat) || 0;
    if (s.netWeight) totalStoneWeight += Number(s.netWeight) || 0;
    if (s.stoneType && !stoneTypes.includes(s.stoneType) && s.stoneType !== 'None') {
      stoneTypes.push(s.stoneType);
    }
  });

  let stoneSummary = '';
  if (stoneTypes.length > 0) {
    stoneSummary = stoneTypes.join(', ');
    if (totalStoneCarat > 0) stoneSummary += ` (${totalStoneCarat.toFixed(2)} ct)`;
    else if (totalStoneWeight > 0) stoneSummary += ` (${totalStoneWeight.toFixed(3)} g)`;
  } else if (item.stoneValue > 0) {
    stoneSummary = `Stone Val: ${formatCurrency(item.stoneValue)}`;
  }

  // Metal Rate
  const metalRate = Number(item.metalRate || item.goldRateAtTime || item.calculatedPrice?.rateUsed || p.price || 0);

  // Making charges
  const makingCharges = Number(item.makingCharge || item.makingCharges || p.makingCharges || item.calculatedPrice?.originalMakingCharge || item.calculatedPrice?.makingCharge || 0);
  const makingChargeType = p.makingChargeType || item.makingChargeType || 'per_gram';
  let makingChargeDisplay = '';
  if (makingCharges > 0) {
    makingChargeDisplay = makingChargeType === 'per_gram'
      ? `${formatCurrency(makingCharges)}/g`
      : formatCurrency(makingCharges);
  }

  // Quantity & Pricing
  const quantity = Number(item.quantity || 1);
  const unitPrice = Number(item.unitPrice || item.price || p.price || (item.totalPrice ? Number(item.totalPrice) / quantity : 0));
  const discount = Number(item.discount || 0);
  const totalPrice = Number(item.totalPrice || item.totalAmount || item.total || (unitPrice * quantity - discount));

  // Thumbnail Image
  const imageUrl = (images.length > 0 && images[0]?.url) ? images[0].url : (item.imageUrl || item.image || null);

  return {
    name,
    sku,
    tagId,
    huid,
    hsnCode,
    metalType,
    purity,
    metalColor,
    metalPurityDisplay,
    grossWeight,
    netWeight,
    stoneSummary,
    metalRate,
    makingCharges,
    makingChargeDisplay,
    quantity,
    unitPrice,
    discount,
    totalPrice,
    imageUrl
  };
};

/**
 * Renders an email-compatible table card displaying complete product jewelry specifications.
 */
const renderProductItemHtml = (item) => {
  const d = extractItemDetails(item);

  return `
    <table style="width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 14px; border-collapse: separate; background-color: #ffffff; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
      <tr>
        ${d.imageUrl ? `
        <td style="vertical-align: top; width: 68px; padding-right: 12px;">
          <img src="${d.imageUrl}" alt="${d.name}" width="64" height="64" style="width: 64px; height: 64px; object-fit: cover; border-radius: 6px; display: block; border: 1px solid #e2e8f0;" />
        </td>` : ''}
        <td style="vertical-align: top;">
          <div style="font-size: 14px; font-weight: bold; color: #0f172a; line-height: 1.3; margin-bottom: 4px;">
            ${d.name}
          </div>
          <div style="font-size: 11px; color: #64748b; font-family: monospace;">
            ${d.sku ? `SKU: <strong style="color: #1e293b;">${d.sku}</strong>` : ''}
            ${d.tagId ? ` &bull; Tag: ${d.tagId}` : ''}
            ${d.huid ? ` &bull; HUID: ${d.huid}` : ''}
          </div>
          <div style="font-size: 12px; color: #475569; margin-top: 4px;">
            Qty: <strong>${d.quantity}</strong> &times; ${formatCurrency(d.unitPrice)}
          </div>
        </td>
        <td style="vertical-align: top; text-align: right; width: 120px;">
          <div style="font-size: 15px; font-weight: bold; color: #0f172a;">
            ${formatCurrency(d.totalPrice)}
          </div>
          ${d.discount > 0 ? `
          <div style="font-size: 11px; color: #16a34a; font-weight: 500;">
            -${formatCurrency(d.discount)} off
          </div>` : ''}
        </td>
      </tr>
      <tr>
        <td colspan="${d.imageUrl ? 3 : 2}" style="padding-top: 10px; border-top: 1px dashed #e2e8f0; margin-top: 8px;">
          <table style="width: 100%; font-size: 11px; color: #475569; border-collapse: collapse;">
            <tr>
              <td style="padding: 3px 0; color: #64748b; width: 25%;">Metal / Purity:</td>
              <td style="padding: 3px 0; font-weight: 600; color: #1e293b; width: 25%;">${d.metalPurityDisplay}</td>
              <td style="padding: 3px 0; color: #64748b; width: 25%;">HSN Code:</td>
              <td style="padding: 3px 0; font-weight: 600; color: #1e293b; width: 25%;">${d.hsnCode}</td>
            </tr>
            <tr>
              <td style="padding: 3px 0; color: #64748b;">Gross Weight:</td>
              <td style="padding: 3px 0; font-weight: 600; color: #1e293b;">${d.grossWeight > 0 ? `${d.grossWeight.toFixed(3)} g` : '-'}</td>
              <td style="padding: 3px 0; color: #64748b;">Net Gold Wt:</td>
              <td style="padding: 3px 0; font-weight: 600; color: #b45309;">${d.netWeight > 0 ? `${d.netWeight.toFixed(3)} g` : '-'}</td>
            </tr>
            ${(d.metalRate > 0 || d.makingChargeDisplay || d.stoneSummary) ? `
            <tr>
              <td style="padding: 3px 0; color: #64748b;">${d.metalRate > 0 ? 'Metal Rate:' : ''}</td>
              <td style="padding: 3px 0; font-weight: 600; color: #1e293b;">${d.metalRate > 0 ? `${formatCurrency(d.metalRate)}/g` : ''}</td>
              <td style="padding: 3px 0; color: #64748b;">${d.makingChargeDisplay ? 'Making Charges:' : (d.stoneSummary ? 'Stone Details:' : '')}</td>
              <td style="padding: 3px 0; font-weight: 600; color: #1e293b;">${d.makingChargeDisplay || d.stoneSummary || ''}</td>
            </tr>` : ''}
            ${(d.makingChargeDisplay && d.stoneSummary) ? `
            <tr>
              <td style="padding: 3px 0; color: #64748b;">Stone Details:</td>
              <td colspan="3" style="padding: 3px 0; font-weight: 600; color: #1e293b;">${d.stoneSummary}</td>
            </tr>` : ''}
          </table>
        </td>
      </tr>
    </table>
  `;
};

/**
 * Text formatter for fallback plain-text emails.
 */
const renderProductItemText = (item) => {
  const d = extractItemDetails(item);
  let line = `• ${d.name} ${d.sku ? `(SKU: ${d.sku})` : ''}\n`;
  line += `  Purity: ${d.metalPurityDisplay} | HSN: ${d.hsnCode}\n`;
  line += `  Gross Wt: ${d.grossWeight.toFixed(3)}g | Net Wt: ${d.netWeight.toFixed(3)}g`;
  if (d.metalRate > 0) line += ` | Rate: ${formatCurrency(d.metalRate)}/g`;
  if (d.makingChargeDisplay) line += ` | Making: ${d.makingChargeDisplay}`;
  if (d.stoneSummary) line += ` | Stone: ${d.stoneSummary}`;
  line += `\n  Qty: ${d.quantity} | Total: ${formatCurrency(d.totalPrice)}\n\n`;
  return line;
};

/**
 * Shared CarbonSmith Email Header with official wordmark logo
 */
const renderBrandHeaderHtml = (subTitle = '') => `
  <div style="background-color: #ffffff; padding: 24px 20px 18px 20px; text-align: center; border-bottom: 2px solid #0f172a;">
    <a href="${BRAND_WEBSITE}" target="_blank" style="text-decoration: none; display: inline-block;">
      <img src="${BRAND_LOGO_URL}" alt="CarbonSmith" style="max-height: 48px; width: auto; max-width: 240px; display: block; margin: 0 auto; border: 0;" />
    </a>
    <div style="margin-top: 8px; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #64748b; font-weight: 600;">
      ${subTitle || "Yours' By Design • Crafted with Elegance"}
    </div>
  </div>
`;

/**
 * Shared CarbonSmith Email Footer
 */
const renderBrandFooterHtml = () => `
  <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 20px; text-align: center; font-size: 12px; color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
    <p style="margin: 0 0 6px 0; font-weight: bold; color: #0f172a; text-transform: uppercase; letter-spacing: 1px;">CARBONSMITH PRIVATE LIMITED</p>
    <p style="margin: 0 0 6px 0;">${BRAND_STORE_ADDRESS}</p>
    <p style="margin: 0 0 10px 0;">Phone: ${BRAND_LANDLINE} / ${BRAND_PHONE} &bull; Email: <a href="mailto:${BRAND_EMAIL}" style="color: #0f172a; text-decoration: underline;">${BRAND_EMAIL}</a> &bull; Web: <a href="${BRAND_WEBSITE}" style="color: #0f172a; text-decoration: underline;">www.thecarbonsmith.com</a></p>
    <p style="margin: 0; color: #94a3b8; font-size: 11px;">This is an automated system confirmation. Crafted with Elegance. Made to Last.</p>
  </div>
`;

/**
 * Online E-Commerce Order Confirmation Email
 */
const generateOrderConfirmationEmail = (order, user) => {
  const orderId = order.orderNumber || order.id;
  const customerName = user?.name || order.shippingAddress?.name || 'Valued Customer';
  const subject = `Thank You for Your Order! - #${orderId}`;

  const address = order.shippingAddress || {};
  const orderDate = formatDate(order.createdAt || new Date());
  const estimatedDelivery = new Date(order.createdAt || new Date());
  estimatedDelivery.setDate(estimatedDelivery.getDate() + 7);
  const deliveryDateStr = formatDate(estimatedDelivery);

  const items = order.items || [];
  const itemsHtml = items.map(item => renderProductItemHtml(item)).join('');
  const itemsText = items.map(item => renderProductItemText(item)).join('');

  const subTotal = Number(order.subTotal || 0);
  const discountTotal = Number(order.discountTotal || order.discount || 0);
  const shippingCost = Number(order.shippingCost || 0);
  const taxTotal = Number(order.taxTotal || 0);
  const cgst = Number((taxTotal / 2).toFixed(2));
  const sgst = Number((taxTotal - cgst).toFixed(2));
  const grandTotal = Number(order.grandTotal || (subTotal - discountTotal + shippingCost + taxTotal));

  const text = `Thank You for Your Order! - #${orderId}\n\nDear ${customerName},\n\nThank you for choosing CarbonSmith. We’re delighted to confirm that your order has been received successfully.\n\nOrder Details\nOrder ID: ${orderId}\nOrder Date: ${orderDate}\nPayment Status: ${order.paymentStatus || 'PENDING'}\nPayment Method: ${order.paymentMethod || 'COD'}\nOrder Status: ${order.orderStatus || 'Processing'}\n\nYour Products:\n${itemsText}\nOrder Summary:\nSubtotal: ${formatCurrency(subTotal)}\nDiscount: -${formatCurrency(discountTotal)}\nShipping: ${shippingCost > 0 ? formatCurrency(shippingCost) : 'FREE'}\nCGST (1.5%): ${formatCurrency(cgst)}\nSGST (1.5%): ${formatCurrency(sgst)}\nTotal GST (3%): ${formatCurrency(taxTotal)}\nGrand Total: ${formatCurrency(grandTotal)}\n\nDelivery Address:\n${customerName}\n${address.addressLine1 || ''} ${address.addressLine2 || ''}\n${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}\n${address.country || 'India'}\nPhone: ${address.phone || user?.phone || ''}\n\nEstimated Delivery: ${deliveryDateStr}\n\nNeed Help?\nPhone: ${BRAND_PHONE}\nEmail: ${BRAND_EMAIL}\nWebsite: ${BRAND_WEBSITE}\n\nWarm regards,\nTeam CarbonSmith`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b; line-height: 1.5;">
      <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        
        ${renderBrandHeaderHtml('Order Confirmation Receipt')}

        <div style="padding: 24px;">
          <h2 style="margin: 0 0 10px 0; font-size: 20px; color: #0f172a; text-align: center;">Thank You for Your Order!</h2>
          <p style="font-size: 15px; margin: 0 0 18px 0; color: #475569;">
            Dear <strong>${customerName}</strong>,<br/>
            Thank you for shopping with <strong>CarbonSmith</strong>. We are delighted to confirm that your order has been received and is being prepared with master artisanal precision.
          </p>

          <!-- Order Overview Box -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Order Details</h3>
            <table style="width: 100%; font-size: 13px;">
              <tr><td style="padding: 3px 0; color: #64748b;">Order ID:</td><td style="text-align: right; font-weight: bold; font-family: monospace; color: #0f172a;">${orderId}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Order Date:</td><td style="text-align: right; font-weight: 500;">${orderDate}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Payment Method:</td><td style="text-align: right; font-weight: 600; text-transform: uppercase;">${order.paymentMethod || 'COD'}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Payment Status:</td><td style="text-align: right; font-weight: bold; color: ${order.paymentStatus === 'completed' || order.paymentStatus === 'PAID' ? '#15803d' : '#b45309'}; text-transform: uppercase;">${order.paymentStatus || 'PENDING'}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Order Status:</td><td style="text-align: right; font-weight: bold; color: #0f172a; text-transform: capitalize;">${order.orderStatus || 'Processing'}</td></tr>
            </table>
          </div>

          <!-- Product Details Section -->
          <div style="margin: 25px 0 15px 0;">
            <h3 style="margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 2px solid #0f172a; padding-bottom: 6px;">
              Purchased Jewelry Specifications (${items.length} ${items.length === 1 ? 'Item' : 'Items'})
            </h3>
            ${itemsHtml}
          </div>

          <!-- Order Financial Summary -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Order Financial Summary</h3>
            <table style="width: 100%; font-size: 13px;">
              <tr><td style="padding: 3px 0; color: #64748b;">Subtotal:</td><td style="text-align: right; font-weight: 600;">${formatCurrency(subTotal)}</td></tr>
              ${discountTotal > 0 ? `<tr><td style="padding: 3px 0; color: #16a34a;">Discount:</td><td style="text-align: right; font-weight: 600; color: #16a34a;">-${formatCurrency(discountTotal)}</td></tr>` : ''}
              <tr><td style="padding: 3px 0; color: #64748b;">Shipping Cost:</td><td style="text-align: right; font-weight: 600;">${shippingCost > 0 ? formatCurrency(shippingCost) : 'FREE'}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">CGST (1.5%):</td><td style="text-align: right; font-weight: 600;">${formatCurrency(cgst)}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">SGST (1.5%):</td><td style="text-align: right; font-weight: 600;">${formatCurrency(sgst)}</td></tr>
              <tr style="border-top: 2px solid #0f172a;">
                <td style="padding: 8px 0; font-size: 15px; font-weight: bold; color: #0f172a;">Grand Total:</td>
                <td style="padding: 8px 0; text-align: right; font-size: 16px; font-weight: bold; color: #0f172a;">${formatCurrency(grandTotal)}</td>
              </tr>
            </table>
          </div>

          <!-- Delivery Address & Delivery Timeline -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
            <h3 style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Delivery Details</h3>
            <p style="margin: 0 0 6px 0; font-size: 13px; color: #1e293b;">
              <strong>Recipient:</strong> ${customerName}<br/>
              ${address.addressLine1 ? `${address.addressLine1}<br/>` : ''}
              ${address.addressLine2 ? `${address.addressLine2}<br/>` : ''}
              ${address.city || ''}${address.state ? `, ${address.state}` : ''} - ${address.pincode || ''}<br/>
              ${address.country || 'India'}<br/>
              <strong>Contact:</strong> ${address.phone || user?.phone || '-'}
            </p>
            <div style="margin-top: 10px; padding: 8px 12px; background-color: #eff6ff; border-radius: 6px; font-size: 12px; color: #1e40af;">
              🚚 <strong>Estimated Delivery:</strong> ${deliveryDateStr}
            </div>
          </div>

          <!-- Support Box -->
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin: 20px 0; font-size: 13px; color: #166534;">
            <h4 style="margin: 0 0 6px 0; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">Need Assistance?</h4>
            <p style="margin: 0 0 4px 0;">Call our concierge: <strong>${BRAND_PHONE}</strong></p>
            <p style="margin: 0;">Email: <a href="mailto:${BRAND_EMAIL}" style="color: #166534; font-weight: bold;">${BRAND_EMAIL}</a></p>
          </div>
        </div>

        ${renderBrandFooterHtml()}
      </div>
    </body>
    </html>
  `;

  return { subject, text, html };
};

/**
 * POS Showroom Purchase Bill / Store Receipt Email
 */
const generatePOSBillEmail = (posOrder, customerName) => {
  const safeOrderId = posOrder.orderNumber || posOrder.id || 'POS-ORDER';
  const subject = `Your Purchase Receipt & Bill - #${safeOrderId}`;

  const billDateTime = formatDateTime(posOrder.createdAt || new Date());
  const items = posOrder.items || [];
  const itemsHtml = items.map(item => renderProductItemHtml(item)).join('');
  const itemsText = items.map(item => renderProductItemText(item)).join('');

  const subTotal = Number(posOrder.subTotal || posOrder.subtotal || 0);
  const discountTotal = Number(posOrder.discountTotal || posOrder.discountAmount || posOrder.discount || 0);
  const taxableValue = Math.max(0, subTotal - discountTotal);
  const taxTotal = Number(posOrder.taxTotal || posOrder.totalGST || 0);
  const cgst = Number((taxTotal / 2).toFixed(2));
  const sgst = Number((taxTotal - cgst).toFixed(2));
  const grandTotal = Number(posOrder.grandTotal || (taxableValue + taxTotal));

  const cashPaid = Number(posOrder.cashPaid || 0);
  const cardPaid = Number(posOrder.cardPaid || 0);
  const upiPaid = Number(posOrder.upiPaid || 0);
  const creditUsed = Number(posOrder.creditUsed || 0);

  // Payments breakdown lines
  let paymentRowsHtml = '';
  if (cashPaid > 0) {
    paymentRowsHtml += `<tr><td style="padding: 3px 0; color: #64748b;">Cash Paid:</td><td style="padding: 3px 0; text-align: right; font-weight: 600; color: #0f172a;">${formatCurrency(cashPaid)}</td></tr>`;
  }
  if (cardPaid > 0) {
    paymentRowsHtml += `<tr><td style="padding: 3px 0; color: #64748b;">Card Paid:</td><td style="padding: 3px 0; text-align: right; font-weight: 600; color: #0f172a;">${formatCurrency(cardPaid)}</td></tr>`;
  }
  if (upiPaid > 0) {
    paymentRowsHtml += `<tr><td style="padding: 3px 0; color: #64748b;">UPI / Online:</td><td style="padding: 3px 0; text-align: right; font-weight: 600; color: #0f172a;">${formatCurrency(upiPaid)}</td></tr>`;
  }
  if (creditUsed > 0) {
    const isCreditMemo = posOrder.notes && posOrder.notes.includes('Credit Memo');
    const creditLabel = isCreditMemo ? 'Advance / Credit Memo Adjusted:' : 'Savings Scheme / Store Credit:';
    paymentRowsHtml += `<tr><td style="padding: 3px 0; color: #64748b;">${creditLabel}</td><td style="padding: 3px 0; text-align: right; font-weight: 600; color: #b45309;">${formatCurrency(creditUsed)}</td></tr>`;
  }
  if (Array.isArray(posOrder.payments) && posOrder.payments.length > 0) {
    paymentRowsHtml = posOrder.payments.map(p => {
      const m = String(p.method || p.paymentMode || 'Payment').toLowerCase();
      let label = m.toUpperCase();
      if (m === 'credit_memo') label = 'Advance / Credit Memo Adjusted';
      else if (m === 'scheme_redemption') label = 'Savings Scheme (Deposit Credit)';
      else if (m === 'cash') label = 'Cash Paid';
      else if (m === 'upi') label = 'UPI / Online';
      else if (m === 'card') label = 'Card Paid';

      return `
        <tr>
          <td style="padding: 3px 0; color: #64748b;">${label}${p.reference ? ` (${p.reference})` : ''}:</td>
          <td style="padding: 3px 0; text-align: right; font-weight: 600; color: #0f172a;">${formatCurrency(p.amount)}</td>
        </tr>
      `;
    }).join('');
  }

  const text = `Purchase Receipt & Bill - #${safeOrderId}\n\nDear ${customerName},\n\nThank you for shopping at CarbonSmith Showroom. Here is your official purchase receipt.\n\nReceipt Details:\nReceipt No: ${safeOrderId}\nDate: ${billDateTime}\nShowroom: CarbonSmith, Pimple Saudagar, Pune\n\nPurchased Products:\n${itemsText}\nInvoice Summary:\nGross Subtotal: ${formatCurrency(subTotal)}\nTotal Discount: -${formatCurrency(discountTotal)}\nTaxable Value: ${formatCurrency(taxableValue)}\nCGST (1.5%): ${formatCurrency(cgst)}\nSGST (1.5%): ${formatCurrency(sgst)}\nTotal GST (3%): ${formatCurrency(taxTotal)}\nGrand Total Paid: ${formatCurrency(grandTotal)}\n\nThank you for your trust and patronage.\n\nShowroom Contact: ${BRAND_LANDLINE} / ${BRAND_PHONE}\nEmail: ${BRAND_EMAIL}\nWebsite: ${BRAND_WEBSITE}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b; line-height: 1.5;">
      <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        
        ${renderBrandHeaderHtml('Showroom Purchase Receipt & Bill')}

        <div style="padding: 24px;">
          <h2 style="margin: 0 0 10px 0; font-size: 20px; color: #0f172a; text-align: center;">Store Purchase Receipt</h2>
          <p style="font-size: 15px; margin: 0 0 18px 0; color: #475569;">
            Dear <strong>${customerName}</strong>,<br/>
            Thank you for shopping with us today at <strong>CarbonSmith</strong>. Please find below the comprehensive details of your jewelry purchase and payment settlement.
          </p>

          <!-- Store Receipt Meta -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Receipt Information</h3>
            <table style="width: 100%; font-size: 13px;">
              <tr><td style="padding: 3px 0; color: #64748b;">Receipt / Bill No:</td><td style="text-align: right; font-weight: bold; font-family: monospace; color: #0f172a;">${safeOrderId}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Date & Time:</td><td style="text-align: right; font-weight: 500;">${billDateTime}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Showroom:</td><td style="text-align: right; font-weight: 500;">Pimple Saudagar, Pune</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Customer Name:</td><td style="text-align: right; font-weight: 600;">${customerName}</td></tr>
              ${posOrder.customerPan ? `<tr><td style="padding: 3px 0; color: #64748b;">Customer PAN:</td><td style="text-align: right; font-family: monospace;">${posOrder.customerPan}</td></tr>` : ''}
              ${posOrder.customerGst ? `<tr><td style="padding: 3px 0; color: #64748b;">Customer GSTIN:</td><td style="text-align: right; font-family: monospace;">${posOrder.customerGst}</td></tr>` : ''}
            </table>
          </div>

          <!-- Product Details Section -->
          <div style="margin: 25px 0 15px 0;">
            <h3 style="margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 2px solid #0f172a; padding-bottom: 6px;">
              Purchased Jewelry Specifications (${items.length} ${items.length === 1 ? 'Item' : 'Items'})
            </h3>
            ${itemsHtml}
          </div>

          <!-- Invoice & Tax Summary -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Invoice & Tax Summary</h3>
            <table style="width: 100%; font-size: 13px;">
              <tr><td style="padding: 3px 0; color: #64748b;">Gross Subtotal:</td><td style="text-align: right; font-weight: 600;">${formatCurrency(subTotal)}</td></tr>
              ${discountTotal > 0 ? `<tr><td style="padding: 3px 0; color: #16a34a;">Total Discount:</td><td style="text-align: right; font-weight: 600; color: #16a34a;">-${formatCurrency(discountTotal)}</td></tr>` : ''}
              <tr><td style="padding: 3px 0; color: #64748b;">Taxable Value:</td><td style="text-align: right; font-weight: 600;">${formatCurrency(taxableValue)}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">CGST (1.5%):</td><td style="text-align: right; font-weight: 600;">${formatCurrency(cgst)}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">SGST (1.5%):</td><td style="text-align: right; font-weight: 600;">${formatCurrency(sgst)}</td></tr>
              <tr style="border-top: 2px solid #0f172a;">
                <td style="padding: 8px 0; font-size: 15px; font-weight: bold; color: #0f172a;">Total Amount Payable:</td>
                <td style="padding: 8px 0; text-align: right; font-size: 16px; font-weight: bold; color: #0f172a;">${formatCurrency(grandTotal)}</td>
              </tr>
            </table>
          </div>

          <!-- Payment Breakdown -->
          ${paymentRowsHtml ? `
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Payment Breakdown</h3>
            <table style="width: 100%; font-size: 13px;">
              ${paymentRowsHtml}
            </table>
            ${posOrder.notes ? `
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #e2e8f0; font-size: 11px; color: #64748b;">
              <strong>Settlement Notes:</strong> ${posOrder.notes}
            </div>` : ''}
          </div>` : ''}

          <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 18px; margin: 20px 0; font-size: 13px; color: #1e40af; line-height: 1.5;">
            💎 <strong>CarbonSmith Guarantee:</strong> All gold and diamond jewellery sold at CarbonSmith is 100% BIS Hallmarked and certified. Please preserve this receipt for your records and future exchange/buyback evaluations.
          </div>
        </div>

        ${renderBrandFooterHtml()}
      </div>
    </body>
    </html>
  `;

  return { subject, text, html };
};

/**
 * Tax Invoice Email
 */
const generateInvoiceEmail = (invoice, order, user) => {
  const customerName = user?.name || order?.shippingAddress?.name || 'Valued Customer';
  const invoiceNum = invoice.invoiceNumber || 'INVOICE';
  const subject = `Your Tax Invoice - #${invoiceNum}`;

  const items = order?.items || invoice?.items || [];
  const itemsHtml = items.map(item => renderProductItemHtml(item)).join('');
  const itemsText = items.map(item => renderProductItemText(item)).join('');

  const subTotal = Number(order?.subTotal || invoice?.subTotal || invoice?.subtotal || 0);
  const taxTotal = Number(order?.taxTotal || invoice?.taxTotal || invoice?.tax || 0);
  const cgst = Number((taxTotal / 2).toFixed(2));
  const sgst = Number((taxTotal - cgst).toFixed(2));
  const grandTotal = Number(order?.grandTotal || invoice?.grandTotal || invoice?.total || (subTotal + taxTotal));

  const text = `Tax Invoice - #${invoiceNum}\n\nDear ${customerName},\n\nYour official tax invoice #${invoiceNum} has been generated.\nTotal Amount: ${formatCurrency(grandTotal)}\n\nItems:\n${itemsText}\nInvoice Summary:\nSubtotal: ${formatCurrency(subTotal)}\nCGST (1.5%): ${formatCurrency(cgst)}\nSGST (1.5%): ${formatCurrency(sgst)}\nTotal GST (3%): ${formatCurrency(taxTotal)}\nGrand Total: ${formatCurrency(grandTotal)}\n\nThank you for choosing CarbonSmith!\nWebsite: ${BRAND_WEBSITE}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b; line-height: 1.5;">
      <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        
        ${renderBrandHeaderHtml('Tax Invoice & Receipt')}

        <div style="padding: 24px;">
          <h2 style="margin: 0 0 10px 0; font-size: 20px; color: #0f172a; text-align: center;">Tax Invoice</h2>
          <p style="font-size: 15px; margin: 0 0 18px 0; color: #475569;">
            Dear <strong>${customerName}</strong>,<br/>
            Thank you for your business. Please find below the official tax invoice details for your transaction:
          </p>

          <!-- Invoice Metadata -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
            <table style="width: 100%; font-size: 13px;">
              <tr><td style="padding: 3px 0; color: #64748b;">Invoice Number:</td><td style="text-align: right; font-weight: bold; font-family: monospace; color: #0f172a;">${invoiceNum}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Invoice Date:</td><td style="text-align: right; font-weight: 500;">${formatDate(invoice.date || invoice.issueDate || invoice.createdAt || new Date())}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Customer Name:</td><td style="text-align: right; font-weight: 600;">${customerName}</td></tr>
            </table>
          </div>

          <!-- Product Details Section -->
          <div style="margin: 25px 0 15px 0;">
            <h3 style="margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 2px solid #0f172a; padding-bottom: 6px;">
              Itemized Specifications (${items.length} ${items.length === 1 ? 'Item' : 'Items'})
            </h3>
            ${itemsHtml}
          </div>

          <!-- Financial Summary -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Invoice Summary</h3>
            <table style="width: 100%; font-size: 13px;">
              <tr><td style="padding: 3px 0; color: #64748b;">Subtotal:</td><td style="text-align: right; font-weight: 600;">${formatCurrency(subTotal)}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">CGST (1.5%):</td><td style="text-align: right; font-weight: 600;">${formatCurrency(cgst)}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">SGST (1.5%):</td><td style="text-align: right; font-weight: 600;">${formatCurrency(sgst)}</td></tr>
              <tr style="border-top: 2px solid #0f172a;">
                <td style="padding: 8px 0; font-size: 15px; font-weight: bold; color: #0f172a;">Grand Total:</td>
                <td style="padding: 8px 0; text-align: right; font-size: 16px; font-weight: bold; color: #0f172a;">${formatCurrency(grandTotal)}</td>
              </tr>
            </table>
          </div>
        </div>

        ${renderBrandFooterHtml()}
      </div>
    </body>
    </html>
  `;

  return { subject, text, html };
};

/**
 * Employee Welcome & Credentials Email
 */
const generateEmployeeWelcomeEmail = (employee, password, loginUrl) => {
  const subject = 'Welcome to CarbonSmith - Your Employee Account Credentials';

  const emailLine = employee.email ? `\nEmail: ${employee.email}` : '';
  const phoneLine = employee.phone ? `\nPhone: ${employee.phone}` : '';
  const text = `Hello ${employee.name},\n\nYour employee account has been successfully created.\n\nRole: ${employee.role}${emailLine}${phoneLine}\nPassword: ${password}\n\nYou can log in at: ${loginUrl}\n\nBest regards,\nCarbonSmith Operations Team`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b; line-height: 1.5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        
        ${renderBrandHeaderHtml('Staff Portal Onboarding')}

        <div style="padding: 24px;">
          <h2 style="color: #0f172a; text-align: center; margin: 0 0 16px 0;">Welcome to CarbonSmith!</h2>
          <p style="font-size: 15px; color: #475569;">Hello <strong>${employee.name}</strong>,</p>
          <p style="font-size: 15px; color: #475569;">Your staff access credentials have been generated. Please keep your login details secure:</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; font-size: 14px;">
              <tr><td style="padding: 4px 0; color: #64748b;">Assigned Role:</td><td style="padding: 4px 0; font-weight: bold; color: #0f172a;">${employee.role}</td></tr>
              ${employee.email ? `<tr><td style="padding: 4px 0; color: #64748b;">Email:</td><td style="padding: 4px 0; font-family: monospace;">${employee.email}</td></tr>` : ''}
              ${employee.phone ? `<tr><td style="padding: 4px 0; color: #64748b;">Phone:</td><td style="padding: 4px 0; font-family: monospace;">${employee.phone}</td></tr>` : ''}
              <tr><td style="padding: 4px 0; color: #64748b;">Temporary Password:</td><td style="padding: 4px 0; font-family: monospace; font-weight: bold; color: #b45309;">${password}</td></tr>
            </table>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="background-color: #0f172a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Login to POS Portal</a>
          </div>
        </div>

        ${renderBrandFooterHtml()}
      </div>
    </body>
    </html>
  `;

  return { subject, text, html };
};

/**
 * Advance Deposit & Credit Memo Email
 */
const generateCreditMemoEmail = (creditMemo, customer) => {
  const customerName = customer?.name || 'Valued Customer';
  const memoId = creditMemo.memoId || creditMemo.id || 'CS-CM';
  const subject = `Advance Deposit Receipt & Credit Memo - #${memoId}`;

  const amount = Number(creditMemo.originalAmount || creditMemo.balance || 0);
  const paymentMethod = (creditMemo.paymentMethod || 'advance').toUpperCase();
  const memoDate = formatDateTime(creditMemo.createdAt || new Date());
  const purity = creditMemo.referencePurity || creditMemo.exchangePurity || '22K';
  const lockedRate = Number(creditMemo.lockedGoldRate || 0);
  const lockedGrams = Number(creditMemo.lockedGrams || 0);
  const lockedPureGrams = Number(creditMemo.lockedPureGrams || 0);
  const exchangeWeight = Number(creditMemo.exchangeWeight || 0);

  const text = `Advance Deposit Receipt & Credit Memo - #${memoId}\n\nDear ${customerName},\n\nThank you for choosing CarbonSmith. Your advance deposit has been successfully recorded and rate-locked.\n\nMemo ID: ${memoId}\nDate: ${memoDate}\nDeposit Amount: ${formatCurrency(amount)}\nPayment Mode: ${paymentMethod}\nRate-Locked Purity: ${purity} Gold\nLocked Gold Rate: ${lockedRate > 0 ? `${formatCurrency(lockedRate)}/g` : '-'}\nGold Grams Credited: ${lockedGrams > 0 ? `${lockedGrams.toFixed(4)} g` : '-'}\n\nShowroom: ${BRAND_STORE_ADDRESS}\nPhone: ${BRAND_LANDLINE} / ${BRAND_PHONE}\nEmail: ${BRAND_EMAIL}\nWebsite: ${BRAND_WEBSITE}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b; line-height: 1.5;">
      <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        
        ${renderBrandHeaderHtml('Advance Deposit & Credit Memo Certificate')}

        <div style="padding: 24px;">
          <h2 style="margin: 0 0 10px 0; font-size: 20px; color: #0f172a; text-align: center;">Advance Deposit Receipt</h2>
          <p style="font-size: 15px; margin: 0 0 18px 0; color: #475569;">
            Dear <strong>${customerName}</strong>,<br/>
            Thank you for depositing your advance with <strong>CarbonSmith</strong>. Your credit memo has been issued and your gold rate is protected under our live rate-lock guarantee.
          </p>

          <!-- Memo Meta Box -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Credit Memo Information</h3>
            <table style="width: 100%; font-size: 13px;">
              <tr><td style="padding: 3px 0; color: #64748b;">Memo Reference ID:</td><td style="text-align: right; font-weight: bold; font-family: monospace; color: #0f172a;">${memoId}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Deposit Date & Time:</td><td style="text-align: right; font-weight: 500;">${memoDate}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Payment Mode:</td><td style="text-align: right; font-weight: 600; text-transform: uppercase;">${paymentMethod}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Total Advance Deposited:</td><td style="text-align: right; font-weight: bold; font-size: 16px; color: #15803d; font-family: monospace;">${formatCurrency(amount)}</td></tr>
              <tr><td style="padding: 3px 0; color: #64748b;">Available Credit Balance:</td><td style="text-align: right; font-weight: bold; color: #0f172a;">${formatCurrency(creditMemo.balance !== undefined ? creditMemo.balance : amount)}</td></tr>
            </table>
          </div>

          <!-- Rate-Lock Specifications -->
          ${lockedRate > 0 ? `
          <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #92400e; letter-spacing: 0.5px; border-bottom: 1px solid #fde68a; padding-bottom: 6px;">🔒 Live Rate-Lock Protection</h3>
            <table style="width: 100%; font-size: 13px;">
              <tr><td style="padding: 3px 0; color: #78350f;">Locked Reference Purity:</td><td style="text-align: right; font-weight: bold; color: #92400e;">${purity} Gold</td></tr>
              <tr><td style="padding: 3px 0; color: #78350f;">Locked Metal Rate:</td><td style="text-align: right; font-weight: bold; font-family: monospace; color: #92400e;">${formatCurrency(lockedRate)}/g</td></tr>
              <tr><td style="padding: 3px 0; color: #78350f;">Gold Weight Credited:</td><td style="text-align: right; font-weight: bold; font-size: 15px; color: #b45309; font-family: monospace;">+${lockedGrams.toFixed(4)} g</td></tr>
              ${lockedPureGrams > 0 ? `<tr><td style="padding: 3px 0; color: #78350f;">Pure Gold (24K Equivalent):</td><td style="text-align: right; font-family: monospace; color: #92400e;">${lockedPureGrams.toFixed(4)} g</td></tr>` : ''}
              ${exchangeWeight > 0 ? `<tr><td style="padding: 3px 0; color: #78350f;">Old Gold Deposited:</td><td style="text-align: right; font-weight: bold; color: #92400e;">${exchangeWeight.toFixed(3)} g (${creditMemo.exchangePurity || purity})</td></tr>` : ''}
            </table>
          </div>` : ''}

          ${creditMemo.notes ? `
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #475569;">
            <strong>Deposit Notes / Breakdown:</strong><br/>
            <span style="white-space: pre-wrap;">${creditMemo.notes}</span>
          </div>` : ''}

          <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 18px; margin: 20px 0; font-size: 13px; color: #1e40af; line-height: 1.5;">
            📋 <strong>Redemption Policy:</strong> This advance deposit is redeemable against any future jewelry purchase, bespoke order, or billing at CarbonSmith Showroom. Please quote Memo ID <strong>#${memoId}</strong> at billing settlement.
          </div>
        </div>

        ${renderBrandFooterHtml()}
      </div>
    </body>
    </html>
  `;

  return { subject, text, html };
};

module.exports = {
  generateEmployeeWelcomeEmail,
  generateOrderConfirmationEmail,
  generateInvoiceEmail,
  generatePOSBillEmail,
  generateCreditMemoEmail
};
