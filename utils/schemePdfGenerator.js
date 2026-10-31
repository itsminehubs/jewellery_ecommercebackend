const PDFDocument = require('pdfkit');

/**
 * Generates an official A4 Passbook PDF buffer using PDFKit.
 * Matches retail invoice styling with black/gray borders, clean tables, and comprehensive details.
 */
function generateSchemePassbookPdf(scheme, store = {}) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margin: 30,
                info: {
                    Title: `Scheme_Passbook_${scheme.schemeId || 'CS-SCH'}`,
                    Author: 'CarbonSmith Private Limited',
                    Subject: 'Gold Savings Scheme Passbook & Certificate'
                }
            });

            const buffers = [];
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', err => reject(err));

            const formatCurrency = (amt) => 'Rs. ' + Number(amt || 0).toLocaleString('en-IN');
            const formatDate = (d) => {
                if (!d) return '-';
                const date = new Date(d);
                return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-GB');
            };

            const metadata = scheme.metadata || {};
            const nominee = metadata.nominee || {};
            const customer = scheme.customer || {};
            const installments = scheme.installments || [];
            const monthlyInstallment = Number(scheme.monthlyInstallment || 0);
            const totalMonths = Number(scheme.totalMonths || 11);
            const totalPaid = Number(scheme.totalPaid || 0);
            const accumulatedGrams = Number(scheme.accumulatedGrams || 0);
            const enrolledByName = metadata.enrolledByName || 'Showroom Executive';

            const calculatedMonthsPaid = scheme.monthsPaid != null
                ? Number(scheme.monthsPaid)
                : Math.min(totalMonths, Math.floor(totalPaid / (monthlyInstallment > 0 ? monthlyInstallment : 1)));

            // Sort installments chronologically (oldest to newest)
            const sortedInsts = [...installments].sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0));

            // Map each month index (0 to totalMonths - 1) to covering installment
            const monthCoverageMap = {};
            let currentMonthIdx = 0;
            for (const inst of sortedInsts) {
                const instAmount = Number(inst.amount || 0);
                const covered = monthlyInstallment > 0 ? Math.max(1, Math.round(instAmount / monthlyInstallment)) : 1;
                const gramsPerMonth = inst.gramsCredited != null ? (Number(inst.gramsCredited) / covered) : null;
                for (let c = 0; c < covered && currentMonthIdx < totalMonths; c++) {
                    monthCoverageMap[currentMonthIdx] = {
                        ...inst,
                        displayAmount: monthlyInstallment > 0 ? monthlyInstallment : instAmount,
                        displayGrams: gramsPerMonth != null ? Number(gramsPerMonth.toFixed(4)) : null,
                        isAdvancePart: c > 0
                    };
                    currentMonthIdx++;
                }
            }

            const startDate = new Date(scheme.startDate || scheme.createdAt || Date.now());

            // 1. Header Box
            const left = 30;
            const top = 30;
            const width = 535;

            doc.rect(left, top, width, 45).fillAndStroke('#f8f9fa', '#000000');
            doc.fillColor('#000000')
               .fontSize(14).font('Helvetica-Bold')
               .text('CARBONSMITH PRIVATE LIMITED', left, top + 8, { align: 'center', width })
               .fontSize(9).font('Helvetica')
               .text('Shop No. 7, Kunjir Shyama Prestige, Rahatani Rd, Pimple Saudagar, Pune, Maharashtra 411027', left, top + 24, { align: 'center', width })
               .text('GSTIN: 27AANCC9664L1ZS  |  CIN: U36999PN2021PTC204852  |  Email: donotreply@thecarbonsmith.com', left, top + 34, { align: 'center', width });

            // 2. Certificate Title Sub-Header
            let y = top + 50;
            doc.rect(left, y, width, 22).fillAndStroke('#1a1a1a', '#000000');
            doc.fillColor('#ffffff')
               .fontSize(10).font('Helvetica-Bold')
               .text('GOLD SAVINGS SCHEME PASSBOOK & CERTIFICATE', left, y + 6, { align: 'center', width });

            // 3. Scheme Overview Strip
            y += 22;
            doc.rect(left, y, width, 20).fillAndStroke('#ffffff', '#000000');
            doc.fillColor('#000000')
               .fontSize(8.5).font('Helvetica-Bold')
               .text(`Scheme ID: ${scheme.schemeId || '-'}`, left + 8, y + 5)
               .font('Helvetica')
               .text(`Plan: ${scheme.schemeType || 'GOLD'} (${scheme.purity || '22K'}) - ${totalMonths} Months`, left + 140, y + 5)
               .text(`Enrolled: ${formatDate(scheme.startDate || scheme.createdAt)}`, left + 340, y + 5)
               .font('Helvetica-Bold')
               .text(`Status: ${(scheme.status || 'ACTIVE').toUpperCase()}`, left + 450, y + 5);

            // 4. Three Information Columns
            y += 20;
            const colWidth = width / 3;
            const colHeight = 85;

            // Col 1: Showroom Info
            doc.rect(left, y, colWidth, colHeight).stroke('#000000');
            doc.fontSize(8).font('Helvetica-Bold').text('SHOWROOM & STAFF', left + 6, y + 6);
            doc.font('Helvetica').fontSize(7.5)
               .text(`Store: ${store.name || 'Pimple Saudagar Main Showroom'}`, left + 6, y + 18)
               .text(`Enrolled By: ${enrolledByName}`, left + 6, y + 29)
               .text(`Store ID: ${store.shop_id || scheme.shopId || 'STORE-01'}`, left + 6, y + 40)
               .text(`Phone: ${store.phone || '020-69121427'}`, left + 6, y + 51)
               .text(`State: Maharashtra (Code: 27)`, left + 6, y + 62);

            // Col 2: Customer Details
            doc.rect(left + colWidth, y, colWidth, colHeight).stroke('#000000');
            doc.fontSize(8).font('Helvetica-Bold').text('CUSTOMER & NOMINEE', left + colWidth + 6, y + 6);
            doc.font('Helvetica').fontSize(7.5)
               .text(`Name: ${customer.name || 'Walk-in Customer'}`, left + colWidth + 6, y + 18)
               .text(`Phone: ${customer.phone || '-'}`, left + colWidth + 6, y + 29)
               .text(`Email: ${customer.email || 'Not Provided'}`, left + colWidth + 6, y + 40)
               .text(`KYC: ${scheme.kycType || (customer.panNumber ? 'PAN ' + customer.panNumber : 'VERIFIED')}`, left + colWidth + 6, y + 51)
               .text(`Nominee: ${nominee.name ? `${nominee.name} (${nominee.relation || 'Nominee'})` : 'Not Appointed'}`, left + colWidth + 6, y + 62);

            // Col 3: Scheme Plan Details
            doc.rect(left + (colWidth * 2), y, colWidth, colHeight).stroke('#000000');
            doc.fontSize(8).font('Helvetica-Bold').text('SCHEME SPECIFICATIONS', left + (colWidth * 2) + 6, y + 6);
            doc.font('Helvetica').fontSize(7.5)
               .text(`Monthly EMI: ${formatCurrency(monthlyInstallment)}`, left + (colWidth * 2) + 6, y + 18)
               .text(`Tenure: ${totalMonths} Consecutive Months`, left + (colWidth * 2) + 6, y + 29)
               .text(`Payment Window: 1st to 10th of every month`, left + (colWidth * 2) + 6, y + 40)
               .text(`Maturity Date: ${formatDate(scheme.maturityDate)}`, left + (colWidth * 2) + 6, y + 51)
               .text(`Discounts: Up to 20% off Making Charges`, left + (colWidth * 2) + 6, y + 62);

            // 5. Summary Metrics Bar
            y += colHeight;
            doc.rect(left, y, width, 28).fillAndStroke('#f1f5f9', '#000000');
            doc.fillColor('#000000').fontSize(8);
            
            const mWidth = width / 4;
            // Total Paid
            doc.font('Helvetica').text('TOTAL MONEY PAID', left, y + 4, { align: 'center', width: mWidth });
            doc.font('Helvetica-Bold').fontSize(9).text(formatCurrency(totalPaid), left, y + 15, { align: 'center', width: mWidth });
            
            // Months Paid
            doc.font('Helvetica').fontSize(8).text('MONTHS COMPLETED', left + mWidth, y + 4, { align: 'center', width: mWidth });
            doc.font('Helvetica-Bold').fontSize(9).text(`${calculatedMonthsPaid} of ${totalMonths} Months`, left + mWidth, y + 15, { align: 'center', width: mWidth });
            
            // Gold Grams Credited
            doc.font('Helvetica').fontSize(8).text('TOTAL GOLD CREDITED', left + (mWidth * 2), y + 4, { align: 'center', width: mWidth });
            doc.font('Helvetica-Bold').fontSize(9).text(`${accumulatedGrams.toFixed(4)} g`, left + (mWidth * 2), y + 15, { align: 'center', width: mWidth });

            // Weighted Avg Rate
            const avgRate = accumulatedGrams > 0 ? (totalPaid / accumulatedGrams).toFixed(2) : '0';
            doc.font('Helvetica').fontSize(8).text('WEIGHTED AVG RATE', left + (mWidth * 3), y + 4, { align: 'center', width: mWidth });
            doc.font('Helvetica-Bold').fontSize(9).text(`Rs. ${avgRate}/g`, left + (mWidth * 3), y + 15, { align: 'center', width: mWidth });

            // 6. Schedule & Ledger Table
            y += 28;
            doc.rect(left, y, width, 18).fillAndStroke('#e2e8f0', '#000000');
            doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold')
               .text('11-MONTH IMMUTABLE INSTALLMENT LEDGER & PAYMENT SCHEDULE', left + 8, y + 5);

            y += 18;
            // Table Header
            const colDefs = [
                { title: 'EMI #', w: 35, align: 'center' },
                { title: 'Month / Year', w: 75, align: 'left' },
                { title: 'Due Window', w: 75, align: 'left' },
                { title: 'EMI (Rs)', w: 55, align: 'right' },
                { title: 'Paid Date', w: 60, align: 'center' },
                { title: 'Rate (Rs/g)', w: 55, align: 'right' },
                { title: 'Grams Credited', w: 65, align: 'right' },
                { title: 'Mode', w: 55, align: 'center' },
                { title: 'Status', w: 60, align: 'center' }
            ];

            doc.rect(left, y, width, 16).fillAndStroke('#f8fafc', '#000000');
            doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold');
            let curX = left;
            colDefs.forEach(col => {
                doc.text(col.title, curX + 2, y + 4, { width: col.w - 4, align: col.align });
                curX += col.w;
            });

            y += 16;
            const rowH = 14;

            for (let i = 0; i < totalMonths; i++) {
                const dueDate = new Date(startDate);
                dueDate.setMonth(dueDate.getMonth() + i);
                const monthName = dueDate.toLocaleString('default', { month: 'short', year: 'numeric' });
                const dueWindow = `01 - 10 ${dueDate.toLocaleString('default', { month: 'short' })}`;

                const inst = monthCoverageMap[i];
                const isPaid = Boolean(inst);
                const isAdvance = Boolean(inst?.isAdvancePart);

                const bg = i % 2 === 0 ? '#ffffff' : '#fcfcfc';
                doc.rect(left, y, width, rowH).fillAndStroke(bg, '#000000');
                doc.fillColor('#000000').fontSize(7).font('Helvetica');

                let cx = left;
                // Col 1: Month #
                doc.font('Helvetica-Bold').text(String(i + 1), cx + 2, y + 3, { width: colDefs[0].w - 4, align: 'center' });
                cx += colDefs[0].w;

                // Col 2: Month / Year
                doc.font('Helvetica').text(monthName, cx + 4, y + 3, { width: colDefs[1].w - 8, align: 'left' });
                cx += colDefs[1].w;

                // Col 3: Due Window
                doc.text(dueWindow, cx + 4, y + 3, { width: colDefs[2].w - 8, align: 'left' });
                cx += colDefs[2].w;

                // Col 4: EMI
                const emiAmt = inst ? inst.displayAmount : monthlyInstallment;
                doc.font('Helvetica-Bold').text(formatCurrency(emiAmt).replace('Rs. ', ''), cx + 2, y + 3, { width: colDefs[3].w - 6, align: 'right' });
                cx += colDefs[3].w;

                // Col 5: Paid Date
                const pDate = inst ? formatDate(inst.date || inst.createdAt) : '-';
                doc.font('Helvetica').text(pDate, cx + 2, y + 3, { width: colDefs[4].w - 4, align: 'center' });
                cx += colDefs[4].w;

                // Col 6: Rate
                const rateStr = inst?.goldRateApplied ? `${Number(inst.goldRateApplied).toFixed(0)}` : '-';
                doc.text(rateStr, cx + 2, y + 3, { width: colDefs[5].w - 6, align: 'right' });
                cx += colDefs[5].w;

                // Col 7: Grams
                const gramsStr = inst?.displayGrams ? `+${Number(inst.displayGrams).toFixed(4)}g` : (inst?.gramsCredited ? `+${Number(inst.gramsCredited).toFixed(4)}g` : '-');
                doc.font('Helvetica-Bold').text(gramsStr, cx + 2, y + 3, { width: colDefs[6].w - 6, align: 'right' });
                cx += colDefs[6].w;

                // Col 8: Mode
                const modeStr = inst ? (inst.method || inst.paymentMode || inst.paymentMethod || '—').toUpperCase() : '-';
                doc.font('Helvetica').text(modeStr, cx + 2, y + 3, { width: colDefs[7].w - 4, align: 'center' });
                cx += colDefs[7].w;

                // Col 9: Status
                const statusStr = isPaid ? (isAdvance ? 'PAID (ADV)' : 'PAID') : 'PENDING';
                doc.font('Helvetica-Bold').text(statusStr, cx + 2, y + 3, { width: colDefs[8].w - 4, align: 'center' });

                y += rowH;
            }

            // Table Summary Footer Row
            doc.rect(left, y, width, 16).fillAndStroke('#e2e8f0', '#000000');
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
            doc.text('ACCUMULATED TOTAL: ' + formatCurrency(totalPaid), left + 8, y + 4);
            doc.text(`TOTAL GOLD CREDITED: ${accumulatedGrams.toFixed(4)} g`, left + 200, y + 4);
            doc.text(`${calculatedMonthsPaid} of ${totalMonths} Months Completed (${installments.length} Receipts)`, left + 370, y + 4, { align: 'right', width: 155 });

            // 7. Terms & Regulatory Notes
            y += 20;
            doc.rect(left, y, width, 65).fillAndStroke('#ffffff', '#000000');
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
               .text('IMPORTANT SCHEME TERMS & REDEMPTION CONDITIONS:', left + 8, y + 6);
            doc.font('Helvetica').fontSize(6.5).fillColor('#333333')
               .text('1. Rate-Lock Guarantee: Gold rate is permanently locked on each installment payment date with 4-decimal gram crediting (Rule 8).', left + 8, y + 17)
               .text('2. Payment Schedule: Monthly installment is scheduled between 1st and 10th of every month. Grace period applies per store rules (Rule 2).', left + 8, y + 26)
               .text('3. Advance Payments: Up to 5 installments can be deposited in a single transaction and will be mapped consecutively.', left + 8, y + 35)
               .text('4. Maturity & Redemption: Scheme matures after 330 days / 11 installments. Redeemable against gold & diamond jewellery at any showroom.', left + 8, y + 44)
               .text('5. Security: Dual-OTP verification on registered mobile is mandatory for scheme redemption or closure (Rule 26).', left + 8, y + 53);

            // 8. Signatures Block
            y += 72;
            doc.rect(left, y, width, 55).stroke('#000000');
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000')
               .text('Customer Acceptance & Acknowledgement', left + 15, y + 8)
               .text('For CARBONSMITH PRIVATE LIMITED', left + 340, y + 8);

            doc.font('Helvetica').fontSize(6.5).fillColor('#666666')
               .text('I confirm receipt of this passbook and agree to all scheme terms.', left + 15, y + 18)
               .text(`Enrolled By: ${enrolledByName}  |  Showroom Verified`, left + 340, y + 18);

            doc.moveTo(left + 15, y + 45).lineTo(left + 175, y + 45).stroke('#000000');
            doc.moveTo(left + 340, y + 45).lineTo(left + 500, y + 45).stroke('#000000');

            doc.fontSize(7).font('Helvetica-Bold').fillColor('#000000')
               .text('Customer Signature', left + 15, y + 46)
               .text('Authorized Signatory', left + 340, y + 46);

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { generateSchemePassbookPdf };

