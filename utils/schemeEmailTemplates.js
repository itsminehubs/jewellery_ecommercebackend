/**
 * Dedicated Scheme Email Templates for CarbonSmith Savings Scheme
 * Formatted with professional luxury branding, comprehensive ledger tables, and clean typography.
 */

const formatCurrency = (amt) => '₹' + Number(amt || 0).toLocaleString('en-IN');
const formatDate = (d) => {
    if (!d) return '-';
    const date = new Date(d);
    return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const generateSchemeEnrollmentEmail = (scheme, customer = {}, firstInstallment = null) => {
    const schemeCode = scheme.schemeId || 'CS-SCH';
    const customerName = customer.name || scheme.customer?.name || 'Valued Customer';
    const totalMonths = scheme.totalMonths || 11;
    const monthlyEmi = Number(scheme.monthlyInstallment || 0);
    const purity = scheme.purity || '22K';
    const planType = scheme.schemeType === 'GOLD' ? `Gold Savings Plan (${purity})` : 'Diamond Savings Plan';
    const metadata = scheme.metadata || {};
    const nominee = metadata.nominee || {};

    const subject = `Gold Savings Scheme Enrollment Certificate - #${schemeCode}`;

    let firstPaymentHtml = '';
    if (firstInstallment) {
        firstPaymentHtml = `
            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <h4 style="margin: 0 0 10px 0; color: #166534; font-size: 14px; text-transform: uppercase;">Initial Installment Paid</h4>
                <table style="width: 100%; font-size: 13px; color: #1f2937;">
                    <tr>
                        <td style="padding: 4px 0; color: #4b5563;">Amount Paid:</td>
                        <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #15803d;">${formatCurrency(firstInstallment.amount)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 4px 0; color: #4b5563;">Frozen Gold Rate:</td>
                        <td style="padding: 4px 0; text-align: right; font-family: monospace;">₹${Number(firstInstallment.goldRateApplied || 0).toLocaleString('en-IN')}/g</td>
                    </tr>
                    <tr>
                        <td style="padding: 4px 0; color: #4b5563;">Gold Grams Credited:</td>
                        <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #b45309; font-family: monospace;">+${Number(firstInstallment.gramsCredited || 0).toFixed(4)} g</td>
                    </tr>
                    <tr>
                        <td style="padding: 4px 0; color: #4b5563;">Payment Mode & Txn:</td>
                        <td style="padding: 4px 0; text-align: right; text-transform: uppercase; font-size: 12px;">${firstInstallment.method || 'CASH'} ${firstInstallment.transactionId ? `(${firstInstallment.transactionId})` : ''}</td>
                    </tr>
                </table>
            </div>
        `;
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <!-- Header -->
            <div style="background-color: #0f172a; padding: 28px 24px; text-align: center; color: #ffffff;">
                <h1 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase;">CARBONSMITH</h1>
                <p style="margin: 6px 0 0 0; font-size: 12px; color: #cbd5e1; letter-spacing: 0.5px;">Gold Savings Scheme Enrollment Certificate</p>
                <div style="margin-top: 14px; display: inline-block; background-color: #1e293b; border: 1px solid #334155; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-family: monospace; color: #fbbf24;">
                    Scheme ID: ${schemeCode}
                </div>
            </div>

            <!-- Body Content -->
            <div style="padding: 24px;">
                <p style="font-size: 15px; margin-top: 0;">Dear <strong>${customerName}</strong>,</p>
                <p style="font-size: 14px; line-height: 1.6; color: #475569;">
                    Congratulations and welcome to the <strong>CarbonSmith Gold Savings Scheme</strong>! Your savings account has been successfully enrolled. Your gold rate is protected under our live rate-lock guarantee.
                </p>

                <!-- Scheme Overview Card -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0;">
                    <h3 style="margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Scheme Specifications</h3>
                    <table style="width: 100%; font-size: 13px; color: #334155; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Plan Type:</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: bold;">${planType}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Monthly Installment:</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(monthlyEmi)} / month</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Scheme Tenure:</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: bold;">${totalMonths} Consecutive Months</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Enrollment Date:</td>
                            <td style="padding: 6px 0; text-align: right;">${formatDate(scheme.startDate || scheme.createdAt)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Maturity Date:</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: bold;">${formatDate(scheme.maturityDate)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b;">Nominee Details:</td>
                            <td style="padding: 6px 0; text-align: right;">${nominee.name ? `${nominee.name} (${nominee.relation || 'Nominee'})` : 'None Appointed'}</td>
                        </tr>
                    </table>
                </div>

                ${firstPaymentHtml}

                <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin: 20px 0; font-size: 13px; color: #1e40af; line-height: 1.5;">
                    📎 <strong>Digital Passbook Attached:</strong> Your complete official Passbook Certificate (PDF) is attached to this email. You can also view and track live gold accumulations anytime through our website customer dashboard or in showroom.
                </div>

                <!-- Terms Summary -->
                <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.6;">
                    <p style="margin: 0 0 8px 0; font-weight: bold; color: #334155;">Important Guidelines:</p>
                    <ul style="margin: 0; padding-left: 20px;">
                        <li>Monthly installments are scheduled between the <strong>1st and 10th</strong> of every month.</li>
                        <li>Each installment locks today's live rate and credits physical gold weight with 4-decimal accuracy.</li>
                        <li>Redeemable against Hallmark Gold & Diamond Jewellery upon 330-day maturity with exclusive discount benefits.</li>
                    </ul>
                </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b;">
                <p style="margin: 0 0 6px 0; font-weight: bold; color: #0f172a;">CARBONSMITH PRIVATE LIMITED</p>
                <p style="margin: 0 0 8px 0;">Shop No. 7, Kunjir Shyama Prestige, Pimple Saudagar, Pune 411027 | Tel: 020-69121427</p>
                <p style="margin: 0; color: #94a3b8; font-size: 11px;">This is an automated system email sent from <strong>donotreply@thecarbonsmith.com</strong>. Please do not reply directly.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const text = `Dear ${customerName},\n\nWelcome to CarbonSmith Gold Savings Scheme!\nScheme ID: ${schemeCode}\nPlan: ${planType}\nMonthly EMI: ${formatCurrency(monthlyEmi)}\nTenure: ${totalMonths} Months\nMaturity Date: ${formatDate(scheme.maturityDate)}\n\nYour official Passbook Certificate is attached.\n\nWarm regards,\nTeam CarbonSmith`;

    return { subject, text, html };
};

const generateSchemeInstallmentEmail = (scheme, installment, customer = {}) => {
    const schemeCode = scheme.schemeId || 'CS-SCH';
    const customerName = customer.name || scheme.customer?.name || 'Valued Customer';
    const totalMonths = scheme.totalMonths || 11;
    const monthlyEmi = Number(scheme.monthlyInstallment || 1);
    const totalPaid = Number(scheme.totalPaid || 0);
    const accumulatedGrams = Number(scheme.accumulatedGrams || 0);

    const calculatedMonthsPaid = scheme.monthsPaid != null
        ? Number(scheme.monthsPaid)
        : Math.min(totalMonths, Math.floor(totalPaid / (monthlyEmi > 0 ? monthlyEmi : 1)));

    const installments = scheme.installments || [];
    const instAmount = Number(installment.amount || 0);
    const gramsCredited = Number(installment.gramsCredited || 0);
    const rateApplied = Number(installment.goldRateApplied || 0);
    const methodStr = (installment.method || 'online').toUpperCase();
    const txnId = installment.transactionId || 'DEPOSIT';

    const subject = `Installment Deposit Receipt & Passbook - #${schemeCode}`;

    // Generate table rows for immutable history
    const historyRowsHtml = installments.map((inst, idx) => `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #334155;">
            <td style="padding: 8px 6px; text-align: center;">${idx + 1}</td>
            <td style="padding: 8px 6px;">${formatDate(inst.date || inst.createdAt)}</td>
            <td style="padding: 8px 6px; text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(inst.amount)}</td>
            <td style="padding: 8px 6px; text-align: right; font-family: monospace;">₹${Number(inst.goldRateApplied || 0).toFixed(0)}/g</td>
            <td style="padding: 8px 6px; text-align: right; font-weight: bold; color: #b45309; font-family: monospace;">+${Number(inst.gramsCredited || 0).toFixed(4)}g</td>
            <td style="padding: 8px 6px; text-transform: uppercase; font-size: 11px;">${inst.method || 'CASH'}</td>
        </tr>
    `).join('');

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <!-- Header -->
            <div style="background-color: #0f172a; padding: 26px 24px; text-align: center; color: #ffffff;">
                <h1 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase;">CARBONSMITH</h1>
                <p style="margin: 6px 0 0 0; font-size: 12px; color: #cbd5e1;">Installment Payment Acknowledgement</p>
                <div style="margin-top: 14px; display: inline-block; background-color: #1e293b; border: 1px solid #334155; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-family: monospace; color: #fbbf24;">
                    Scheme ID: ${schemeCode}
                </div>
            </div>

            <!-- Body -->
            <div style="padding: 24px;">
                <p style="font-size: 15px; margin-top: 0;">Dear <strong>${customerName}</strong>,</p>
                <p style="font-size: 14px; line-height: 1.6; color: #475569;">
                    Thank you for your payment. Your savings installment has been received and successfully credited to your digital passbook.
                </p>

                <!-- Current Payment Receipt Box -->
                <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 18px; margin: 20px 0;">
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #bbf7d0; padding-bottom: 8px; margin-bottom: 10px;">
                        <span style="font-size: 12px; font-weight: bold; color: #166534; text-transform: uppercase;">Payment Deposit Receipt</span>
                        <span style="font-size: 12px; font-family: monospace; color: #166534;">Txn: ${txnId.slice(-10)}</span>
                    </div>
                    <table style="width: 100%; font-size: 13px; color: #1f2937;">
                        <tr>
                            <td style="padding: 5px 0; color: #4b5563;">Amount Deposited:</td>
                            <td style="padding: 5px 0; text-align: right; font-weight: bold; font-size: 16px; color: #15803d; font-family: monospace;">${formatCurrency(instAmount)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #4b5563;">Frozen Gold Rate:</td>
                            <td style="padding: 5px 0; text-align: right; font-family: monospace;">₹${rateApplied.toLocaleString('en-IN')}/g</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #4b5563;">Gold Grams Credited:</td>
                            <td style="padding: 5px 0; text-align: right; font-weight: bold; color: #b45309; font-family: monospace;">+${gramsCredited.toFixed(4)} g</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #4b5563;">Payment Mode:</td>
                            <td style="padding: 5px 0; text-align: right; text-transform: uppercase;">${methodStr}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #4b5563;">Receipt Date:</td>
                            <td style="padding: 5px 0; text-align: right;">${formatDate(installment.date || installment.createdAt)}</td>
                        </tr>
                    </table>
                </div>

                <!-- Cumulative Progress Summary -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
                    <h3 style="margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Updated Scheme Balance</h3>
                    <table style="width: 100%; font-size: 13px; color: #334155;">
                        <tr>
                            <td style="padding: 4px 0; color: #64748b;">Cumulative Money Paid:</td>
                            <td style="padding: 4px 0; text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(totalPaid)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #64748b;">Tenure Progress:</td>
                            <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #4f46e5;">${calculatedMonthsPaid} of ${totalMonths} Months Completed</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #64748b;">Total Accumulated Gold:</td>
                            <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #b45309; font-family: monospace;">${accumulatedGrams.toFixed(4)} g</td>
                        </tr>
                    </table>
                </div>

                <!-- Immutable History Table -->
                <h3 style="margin: 24px 0 10px 0; font-size: 13px; text-transform: uppercase; color: #0f172a;">Deposit History (${installments.length} Receipts)</h3>
                <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="background-color: #f1f5f9; color: #475569; font-weight: bold; text-transform: uppercase; font-size: 11px;">
                                <th style="padding: 8px 6px; text-align: center;">#</th>
                                <th style="padding: 8px 6px; text-align: left;">Date</th>
                                <th style="padding: 8px 6px; text-align: right;">Amount</th>
                                <th style="padding: 8px 6px; text-align: right;">Rate</th>
                                <th style="padding: 8px 6px; text-align: right;">Grams</th>
                                <th style="padding: 8px 6px; text-align: left;">Mode</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${historyRowsHtml}
                        </tbody>
                    </table>
                </div>

                <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin: 20px 0; font-size: 13px; color: #1e40af; line-height: 1.5;">
                    📎 <strong>Updated Passbook Attached:</strong> An updated PDF copy of your scheme passbook showing all cumulative deposits is attached to this email.
                </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b;">
                <p style="margin: 0 0 6px 0; font-weight: bold; color: #0f172a;">CARBONSMITH PRIVATE LIMITED</p>
                <p style="margin: 0 0 8px 0;">Shop No. 7, Kunjir Shyama Prestige, Pimple Saudagar, Pune 411027 | Tel: 020-69121427</p>
                <p style="margin: 0; color: #94a3b8; font-size: 11px;">This is an automated system email sent from <strong>donotreply@thecarbonsmith.com</strong>. Please do not reply directly.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const text = `Dear ${customerName},\n\nPayment Received for Scheme #${schemeCode}!\nAmount: ${formatCurrency(instAmount)}\nGold Grams Credited: +${gramsCredited.toFixed(4)}g at ₹${rateApplied}/g\nCumulative Total Paid: ${formatCurrency(totalPaid)} (${calculatedMonthsPaid}/${totalMonths} Months)\nAccumulated Gold: ${accumulatedGrams.toFixed(4)}g\n\nYour updated passbook PDF is attached.\n\nWarm regards,\nTeam CarbonSmith`;

    return { subject, text, html };
};

module.exports = {
    generateSchemeEnrollmentEmail,
    generateSchemeInstallmentEmail
};

