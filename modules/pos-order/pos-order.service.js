const prisma = require('../../config/prisma');
const loyaltyService = require('../user/loyalty.service');
const inventoryService = require('../product/inventory.service');
const cashbookService = require('../accounting/cashbook.service');
const ledgerService = require('../accounting/customer-ledger.service');
const { sendEmail } = require('../../jobs/email.job');
const { generatePOSBillEmail } = require('../../utils/emailTemplates');
const pricingService = require('../product/pricing.service');
const { validateAndCheckDuplicateUtr, findDuplicateUtr } = require('../../utils/utrValidator');
const { generateInvoiceNumber } = require('../../utils/invoiceNumberGenerator');
const ApiError = require('../../utils/ApiError');

const MAX_RETRIES = 3;

const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
const roundTo3 = (num) => Math.round((num + Number.EPSILON) * 1000) / 1000;

/**
 * Calculate the exact price of a POS cart based on live rates
 */
const calculateCartPrice = async (items, storeId, lockedGoldRate = null) => {
    let cartSubtotal = 0;
    let cartGst = 0;
    let cartTotal = 0;
    const calculatedItems = [];

    for (const item of items) {
        // Fetch full product from DB
        const productData = await prisma.product.findFirst({
            where: {
                OR: [
                    { sku: item.sku },
                    { huid: item.sku }
                ]
            },
            include: { metalDetails: true, stoneDetails: true }
        });

        if (!productData) {
            throw require('../../utils/ApiError').notFound(`Product not found for SKU: ${item.sku}`);
        }

        const metalDetails = productData.metalDetails;
        const stoneDetails = productData.stoneDetails;
        const grossWeight = metalDetails?.grossWeight ? Number(metalDetails.grossWeight) : 0;
        let totalStoneWeight = 0;
        let dynamicStoneValue = 0;

        // 1. Calculate Stone Weight and Value
        if (stoneDetails && stoneDetails.length > 0) {
            for (let stone of stoneDetails) {
                let caratVal = stone.carat ? parseFloat(stone.carat) : 0;
                if (caratVal > 0) {
                    stone.netWeight = roundTo3(caratVal * 0.200);
                }
                const stoneWeightGrams = stone.netWeight ? Number(stone.netWeight) : 0;
                totalStoneWeight += stoneWeightGrams;

                let rate = stone.rate ? Number(stone.rate) : 0;
                if (stone.stoneType === 'Diamond') {
                    const query = {
                        cut: stone.cut || 'All',
                        color: stone.color || 'All',
                        clarity: stone.clarity || 'All'
                    };
                    let diamondRateDoc = await prisma.diamondRate.findFirst({
                        where: query,
                        orderBy: { effectiveDate: 'desc' }
                    });
                    if (!diamondRateDoc) {
                        diamondRateDoc = await prisma.diamondRate.findFirst({
                            where: { cut: 'All', color: 'All', clarity: 'All' },
                            orderBy: { effectiveDate: 'desc' }
                        });
                    }
                    if (diamondRateDoc) {
                        rate = Number(diamondRateDoc.ratePerCarat);
                    }
                    const calculationCarat = caratVal > 0 ? caratVal : (stoneWeightGrams / 0.200);
                    dynamicStoneValue += calculationCarat * rate;
                } else {
                    if (caratVal > 0) {
                        dynamicStoneValue += caratVal * rate;
                    } else {
                        dynamicStoneValue += stoneWeightGrams * rate;
                    }
                }
            }
        }

        const manualStoneCharges = productData.stoneCharges ? Number(productData.stoneCharges) : 0;
        const stoneValue = roundTo2(dynamicStoneValue > 0 ? dynamicStoneValue : manualStoneCharges);

        // 2. Net Gold Weight
        const netWeight = roundTo3(Math.max(0, grossWeight - totalStoneWeight));

        let metalValue = 0;
        let rateUsed = 0;
        // 3. Fetch latest metal rate or use locked rate
        if (lockedGoldRate) {
            rateUsed = Number(lockedGoldRate);
        } else if (metalDetails && metalDetails.metalType && metalDetails.purity) {
            const latestRate = await prisma.goldRate.findFirst({
                where: {
                    metal: metalDetails.metalType.toLowerCase(),
                    purity: {
                        equals: metalDetails.purity,
                        mode: 'insensitive'
                    }
                },
                orderBy: [
                    { effectiveDate: 'desc' },
                    { createdAt: 'desc' }
                ]
            });

            if (latestRate) {
                rateUsed = Number(latestRate.ratePerGram);
            }
        }

        if (rateUsed > 0) {
            const wastagePercent = productData.wastage ? Number(productData.wastage) : 0;
            const wastageWeight = netWeight * (wastagePercent / 100);
            const finalGoldWeight = netWeight + wastageWeight;
            metalValue = roundTo2(finalGoldWeight * rateUsed);
        }

        // 5. Calculate Making Charges & Apply Discount
        let makingValue = 0;
        const makingCharges = productData.makingCharges ? Number(productData.makingCharges) : 0;
        if (productData.makingChargeType === 'per_gram') {
            makingValue = makingCharges * netWeight;
        } else {
            makingValue = makingCharges;
        }

        const discountAmount = Number(item.discount || 0);
        let discountedMakingValue = makingValue;
        if (discountAmount > 0) {
            discountedMakingValue = Math.max(0, makingValue - discountAmount);
        }
        discountedMakingValue = roundTo2(discountedMakingValue);

        // 6. Subtotal
        const subtotal = roundTo2(metalValue + discountedMakingValue + stoneValue);

        // 7. GST (Flat 3% on Subtotal)
        const gstRate = Number(productData.gstRate || 3);
        const gst = roundTo2(subtotal * (gstRate / 100));

        // 8. Totals
        const finalTotal = roundTo2(subtotal + gst);

        const qty = Number(item.quantity) || 1;
        cartSubtotal = roundTo2(cartSubtotal + (subtotal * qty));
        cartGst = roundTo2(cartGst + (gst * qty));
        cartTotal = roundTo2(cartTotal + (finalTotal * qty));

        calculatedItems.push({
            ...productData,
            calculatedPrice: {
                metalValue,
                makingCharge: makingValue,
                originalMakingCharge: makingValue,
                discountedMakingValue: discountedMakingValue,
                stoneValue,
                discountAmount,
                subtotal,
                gst,
                finalTotal,
                rateUsed
            },
            quantity: qty
        });
    }

    return {
        items: calculatedItems,
        summary: {
            subtotal: roundTo2(cartSubtotal),
            gst: roundTo2(cartGst),
            total: roundTo2(cartSubtotal + cartGst)
        }
    };
};


/**
 * Create a new POS sale with ERP Financial Integration
 */
const createOrder = async (orderData) => {
    // We use Prisma interactive transactions
    return await prisma.$transaction(async (tx) => {
        // Resolve store UUID from shop_id
        const store = await tx.store.findUnique({ where: { shop_id: orderData.shop_id } });
        if (!store) throw new Error(`Store not found for shop_id: ${orderData.shop_id}`);
        const storeId = store.id;

        // 1. Generate Order Number (Format: CS-INV-001)
        const orderNumber = await generateInvoiceNumber(tx);

        // Validate PAN for large transactions
        if (orderData.grandTotal > 200000 && !orderData.customerPan) {
            throw new Error('PAN is mandatory for transactions above ₹2,00,000');
        }
        if (orderData.customerPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(orderData.customerPan)) {
            throw new Error('Invalid PAN card format. It should be like ABCDE1234F');
        }

        // Prepare totals
        let totalCash = 0;
        let totalOnline = 0;
        let totalCredit = 0;
        let totalSchemeRedemption = 0;
        let totalCreditMemo = 0;

        for (const payment of orderData.payments || []) {
            const amt = Number(payment.amount) || 0;
            if (payment.method === 'cash') {
                totalCash += amt;
            } else if (payment.method === 'upi' || payment.method === 'card') {
                totalOnline += amt;
            } else if (['neft', 'rtgs', 'neft_rtgs', 'bank_transfer'].includes(payment.method)) {
                totalOnline += amt;
                const specificMethod = payment.method === 'rtgs' ? 'rtgs' : 'neft';
                const rawUtr = payment.utrNumber || payment.referenceId || payment.transactionId;
                const cleanUtr = await validateAndCheckDuplicateUtr(tx, rawUtr, payment.method.toUpperCase());
                // Attach clean UTR back to payment object for downstream use
                payment.utrNumber = cleanUtr;
                payment.referenceId = cleanUtr;
                // Append UTR tag to order notes so duplicate detection and printable invoices can parse it
                orderData.notes = (orderData.notes ? orderData.notes + '||' : '') + `PAYMENT_REF:${specificMethod}:UTR:${cleanUtr}:${amt}`;
            } else if (payment.method === 'credit') {
                totalCredit += amt;
            } else if (payment.method === 'scheme_redemption') {
                totalSchemeRedemption += amt;
            } else if (payment.method === 'credit_memo') {
                totalCreditMemo += amt;
            }
        }

        // Preserve manual round-off deduction in order notes for invoice reprint/download
        if (orderData.roundOff && Number(orderData.roundOff) !== 0) {
            orderData.notes = (orderData.notes ? orderData.notes + '||' : '') + `ROUND_OFF:${orderData.roundOff}`;
        }

        // 2. Handle Scheme Redemption (with SECURITY VALIDATION & 27 RULES)
        let redeemedSchemeId = null;
        let schemeRedemptionAudit = null;
        if (totalSchemeRedemption > 0) {
            const totalOrderAmount = Number(orderData.grandTotal || 0);
            if (!orderData.redeemedSchemeId) throw new ApiError(400, 'Scheme ID is required for scheme redemption');
            if (!orderData.customerId) throw new ApiError(400, 'Customer ID is required to redeem a scheme');

            const scheme = await tx.scheme.findUnique({ 
                where: { id: orderData.redeemedSchemeId },
                include: { customer: true, installments: true }
            });
            if (!scheme) throw new Error('Scheme not found');

            // Rule 10: Only the person in whose name the scheme is registered can redeem it
            if (scheme.customerId !== orderData.customerId) {
                throw new Error('SECURITY ALERT: Unauthorized scheme redemption attempt. Scheme does not belong to this customer (Rule 10).');
            }

            if (scheme.status === 'closed') throw new Error('Scheme is already closed');
            if (scheme.status === 'redeemed' && Number(scheme.accumulatedGrams || 0) <= Number(scheme.redeemedGrams || 0)) {
                throw new Error('Scheme has already been fully redeemed');
            }

            // Rule 5: Jewellery can be purchased after completion of 330 days from enrollment
            const enrollmentDate = new Date(scheme.startDate || scheme.createdAt);
            const daysSinceEnrollment = Math.floor((new Date() - enrollmentDate) / (1000 * 60 * 60 * 24));
            if (daysSinceEnrollment < 330 && !orderData.override330DaysLock) {
                throw new Error(`Rule 5 Restriction: Jewellery can only be purchased after completion of 330 days from scheme enrollment date (Current: ${daysSinceEnrollment} days elapsed).`);
            }

            // Rule 22 & 13: Tiered Benefit Ratio
            const paidInstallmentCount = scheme.installments ? scheme.installments.length : 0;
            const totalMonths = scheme.totalMonths || 11;
            const halfTenureThreshold = totalMonths === 11 ? 6 : Math.ceil(totalMonths / 2);

            let benefitRatio = 0;
            let benefitTier = 'NO_BENEFIT';
            if (daysSinceEnrollment > 365) {
                benefitRatio = 0;
                benefitTier = 'EXPIRED_365_DAYS_ZERO_BENEFIT';
            } else if (paidInstallmentCount < halfTenureThreshold) {
                benefitRatio = 0;
                benefitTier = 'PREMATURE_UNDER_HALF_TENURE';
            } else if (paidInstallmentCount >= halfTenureThreshold && paidInstallmentCount < totalMonths) {
                benefitRatio = 0.5;
                benefitTier = 'HALF_TENURE_50_PERCENT_BENEFIT';
            } else if (paidInstallmentCount >= totalMonths) {
                benefitRatio = 1.0;
                benefitTier = 'FULL_TENURE_100_PERCENT_BENEFIT';
            }

            // Rule 9: PAN card mandatory for purchases exceeding ₹2,00,000
            const customerPan = scheme.customer?.panNumber || orderData.customerPan;
            if (totalOrderAmount > 200000 && !customerPan) {
                throw new Error('Rule 9 Mandatory Requirement: PAN card is required for jewellery purchases exceeding ₹2,00,000.');
            }

            // Rule 18 & 19: No additional offers or vouchers can be combined with scheme benefit
            if (orderData.couponCode || orderData.voucherCode || (orderData.discount && Number(orderData.discount) > 0)) {
                throw new Error('Rule 18 & 19 Restriction: Additional offers or vouchers cannot be combined with scheme benefit redemption.');
            }

            // Rule 26: Mandatory OTP Verification
            const schemePaymentObj = (orderData.payments || []).find(p => p.method === 'scheme_redemption');
            const schemeOtp = orderData.schemeOtp || schemePaymentObj?.otp;
            if (!schemeOtp && !orderData.overrideSchemeOtp) {
                throw new Error('Rule 26 Mandatory Requirement: Customer OTP verification is required to authorize scheme redemption.');
            }
            if (schemeOtp && !orderData.overrideSchemeOtp) {
                const otpService = require('../../utils/otpService');
                await otpService.verifyOTP(scheme.customer.phone, schemeOtp);
            }

            // Check items against Admin Configured Applicable Purities & Bullion Restrictions
            let applicablePurities = ['22K', '18K', '14K'];
            try {
                if (scheme.notes && scheme.notes.trim().startsWith('{')) {
                    const parsed = JSON.parse(scheme.notes);
                    if (parsed.applicablePurities && Array.isArray(parsed.applicablePurities)) {
                        applicablePurities = parsed.applicablePurities.map(p => String(p).toUpperCase());
                    }
                }
            } catch (e) {}

            let totalNetGoldWeightRequired = 0;
            let eligibleMakingCharges = 0;
            let eligibleDiamondPrice = 0;
            let eligibleDiamondMaking = 0;

            for (const item of orderData.items || []) {
                const prodId = item.productId || item.product;
                const product = await tx.product.findUnique({ where: { id: prodId } });
                if (product) {
                    const category = (product.category || '').toLowerCase();
                    const title = (product.title || product.name || '').toLowerCase();
                    const purity = (product.purity || '').toUpperCase();

                    // Rule 7: Bullion restriction
                    if (category.includes('coin') || category.includes('bar') || title.includes('coin') || title.includes('gold bar')) {
                        throw new Error(`Bullion Restriction: Scheme is not applicable to coins or bars (${product.title || product.name}). Applicable to jewellery.`);
                    }

                    if (scheme.schemeType === 'GOLD') {
                        // Rule 6: Scheme applicable only to configured gold purities (22K, 18K, 14K)
                        if (purity && applicablePurities.length > 0 && !applicablePurities.includes(purity)) {
                            throw new Error(`Purity Restriction: Scheme is applicable to [${applicablePurities.join(', ')}] jewellery. Selected product is ${purity} (${product.title || product.name}).`);
                        }
                        const itemNetWeight = Number(item.netWeight || product.netWeight || product.weight || 0) * (item.quantity || 1);
                        totalNetGoldWeightRequired += itemNetWeight;
                        const itemMaking = Number(item.makingCharge || product.makingCharges || 0) * (item.quantity || 1);
                        eligibleMakingCharges += itemMaking;
                    } else if (scheme.schemeType === 'DIAMOND') {
                        const itemDiamondVal = Number(item.stoneCharges || product.stoneCharges || 0) * (item.quantity || 1);
                        eligibleDiamondPrice += itemDiamondVal;
                        const itemMaking = Number(item.makingCharge || product.makingCharges || 0) * (item.quantity || 1);
                        eligibleDiamondMaking += itemMaking;
                    }
                }
            }

            let newRedeemedGrams = Number(scheme.redeemedGrams || 0);
            let leftoverGrams = 0;
            let gramsDebited = 0;
            let missingGrams = 0;
            let newStatus = 'redeemed';

            if (scheme.schemeType === 'GOLD') {
                const totalAccumulated = Number(scheme.accumulatedGrams || 0);
                const currentRedeemed = Number(scheme.redeemedGrams || 0);
                const availableGrams = Number(Math.max(0, totalAccumulated - currentRedeemed).toFixed(4));

                if (availableGrams <= 0) {
                    throw new Error('Scheme has zero remaining gold grams available for redemption.');
                }

                gramsDebited = Number(Math.min(availableGrams, totalNetGoldWeightRequired).toFixed(4));
                leftoverGrams = Number(Math.max(0, availableGrams - gramsDebited).toFixed(4));
                missingGrams = Number(Math.max(0, totalNetGoldWeightRequired - availableGrams).toFixed(4));
                newRedeemedGrams = Number((currentRedeemed + gramsDebited).toFixed(4));
                newStatus = leftoverGrams > 0.0001 ? 'partially_redeemed' : 'redeemed';

                // Missing gold quantity handling using dedicated Scheme Gold Rate on redemption date
                let schemeGoldRateUsed = null;
                const normPurity = String(scheme.purity || '22K').trim().toUpperCase();
                const schemeRateRecord = await tx.schemeGoldRate.findFirst({
                    where: {
                        metal: { equals: 'gold', mode: 'insensitive' },
                        purity: { equals: normPurity, mode: 'insensitive' }
                    },
                    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }]
                });
                if (schemeRateRecord) {
                    schemeGoldRateUsed = Number(Number(schemeRateRecord.ratePerGram).toFixed(2));
                }

                // Making charge discount (up to 20% * benefitRatio)
                const makingDiscountPercent = 20 * benefitRatio;
                const makingDiscountAmount = roundTo2(eligibleMakingCharges * (makingDiscountPercent / 100));

                schemeRedemptionAudit = {
                    schemeType: 'GOLD',
                    purity: scheme.purity,
                    availableGramsBefore: availableGrams,
                    gramsDebited,
                    leftoverGrams,
                    missingGrams,
                    totalNetGoldWeightRequired: Number(totalNetGoldWeightRequired.toFixed(4)),
                    schemeGoldRateUsed,
                    missingGoldPricedAtSchemeRate: (missingGrams > 0 && schemeGoldRateUsed) ? roundTo2(missingGrams * schemeGoldRateUsed) : 0,
                    eligibleMakingCharges,
                    makingDiscountPercent,
                    makingDiscountAmount,
                    benefitTier,
                    benefitRatio
                };
            } else if (scheme.schemeType === 'DIAMOND') {
                const diamondDiscountPercent = 40 * benefitRatio;
                const diamondDiscountAmount = roundTo2(eligibleDiamondPrice * (diamondDiscountPercent / 100));
                const makingDiscountPercent = 40 * benefitRatio;
                const makingDiscountAmount = roundTo2(eligibleDiamondMaking * (makingDiscountPercent / 100));

                schemeRedemptionAudit = {
                    schemeType: 'DIAMOND',
                    eligibleDiamondPrice,
                    diamondDiscountPercent,
                    diamondDiscountAmount,
                    eligibleDiamondMaking,
                    makingDiscountPercent,
                    makingDiscountAmount,
                    benefitTier,
                    benefitRatio
                };
            }

            // Update scheme status and grams balance
            await tx.scheme.update({
                where: { id: scheme.id },
                data: {
                    redeemedGrams: newRedeemedGrams,
                    status: newStatus,
                    redemptionDate: new Date(),
                    redemptionValue: (Number(scheme.redemptionValue || 0) + totalSchemeRedemption)
                }
            });

            // Activity Log for Scheme Redemption
            await tx.schemeActivityLog.create({
                data: {
                    schemeId: scheme.id,
                    action: 'REDEMPTION',
                    description: `Scheme redeemed on order ${orderNumber}. Applied: ₹${totalSchemeRedemption.toLocaleString('en-IN')}.${scheme.schemeType === 'GOLD' ? ` Debited: ${gramsDebited}g, Leftover: ${leftoverGrams}g.` : ''}`,
                    details: {
                        orderNumber,
                        totalOrderAmount,
                        totalSchemeRedemption,
                        daysSinceEnrollment,
                        customerPan: customerPan ? `****${customerPan.slice(-4)}` : null,
                        ...schemeRedemptionAudit
                    },
                    performedById: orderData.billedBy
                }
            });

            redeemedSchemeId = scheme.id;
        }

        // 3. Handle Credit Memo Redemption
        if (totalCreditMemo > 0) {
            for (const payment of orderData.payments) {
                if (payment.method === 'credit_memo') {
                    if (!payment.referenceId || !payment.referenceId.trim()) {
                        throw new ApiError(400, 'Reference ID (Credit Memo ID) is required for credit_memo payment. Please select a valid Credit Memo.');
                    }

                    const parsedAmount = Number(payment.amount);
                    const memo = await tx.creditMemo.findFirst({
                        where: {
                            memoId: payment.referenceId.trim()
                        },
                        include: { customer: { select: { phone: true } } }
                    });

                    if (!memo) throw new ApiError(404, `Credit Memo #${payment.referenceId} not found.`);
                    if (Number(memo.balance) < parsedAmount) {
                        throw new ApiError(400, `Credit Memo #${payment.referenceId} has insufficient balance. (Available: ₹${memo.balance}, Required: ₹${parsedAmount})`);
                    }

                    // Security: Verify OTP if provided or require redemption authorization
                    const otp = payment.otp || payment.redemptionOtp;
                    if (!payment.skipOtp && !orderData.skipCreditMemoOtp) {
                        if (!otp) {
                            throw new ApiError(400, `Security Requirement: Customer OTP verification is required to redeem Credit Memo #${memo.memoId}.`);
                        }
                        const otpService = require('../../utils/otpService');
                        const otpKey = `credit_memo_otp_${memo.memoId}`;
                        let otpVerified = false;
                        try {
                            await otpService.verifyOTP(otpKey, String(otp).trim(), true);
                            otpVerified = true;
                        } catch (e1) {
                            if (memo.customer?.phone) {
                                try {
                                    await otpService.verifyOTP(memo.customer.phone, String(otp).trim(), true);
                                    otpVerified = true;
                                } catch (e2) {}
                            }
                        }
                        if (!otpVerified) {
                            throw new ApiError(400, `Invalid or expired OTP for Credit Memo #${memo.memoId}. Redemption denied for security.`);
                        }
                    }

                    const newBalance = Number(memo.balance) - parsedAmount;
                    await tx.creditMemo.update({
                        where: { id: memo.id },
                        data: {
                            balance: newBalance,
                            status: newBalance <= 0 ? 'applied' : 'active',
                            // For a robust system we'd track redemptions in a separate table, but updating balance is key
                        }
                    });

                    // Store reference for invoice re-printing
                    orderData.notes = (orderData.notes ? orderData.notes + '||' : '') + `PAYMENT_REF:credit_memo:${memo.memoId}:${parsedAmount}`;
                }
            }
        }

        const order = await tx.pOSOrder.create({
            data: {
                orderNumber,
                storeId: storeId,
                customerId: orderData.customerId || null,
                staffId: orderData.billedBy,
                customerPan: orderData.customerPan || null,
                customerGst: orderData.customerGst || null,
                subTotal: orderData.subTotal || orderData.subtotal || 0,
                taxTotal: orderData.totalGST || orderData.taxTotal || 0,
                discountTotal: orderData.discount || orderData.discountTotal || 0,
                grandTotal: orderData.grandTotal || ((orderData.subTotal || orderData.subtotal || 0) + (orderData.totalGST || orderData.taxTotal || 0) - (orderData.discount || orderData.discountTotal || 0) + (orderData.roundOff || 0)) || 0,
                cashPaid: totalCash,
                cardPaid: totalOnline, // Simplification
                upiPaid: 0,
                creditUsed: totalCredit,
                status: 'completed',
                notes: orderData.notes,
                items: {
                    create: orderData.items.map(item => ({
                        productId: item.product,
                        quantity: Number(item.quantity) || 1,
                        unitPrice: item.price || 0,
                        metalRate: item.goldRateAtTime || item.metalRate || orderData.metalRate || orderData.currentRate || 0,
                        discount: item.discount || 0,
                        taxAmount: item.taxAmount || 0,
                        totalPrice: item.totalAmount || 0
                    }))
                }
            },
            include: { items: { include: { product: true } } }
        });

        // Link Scheme Redemption to Order
        if (redeemedSchemeId) {
            await tx.scheme.update({
                where: { id: redeemedSchemeId },
                data: { redemptionOrderId: order.id }
            });
        }

        // 5. Process Items
        for (const item of order.items) {
            // Centralized Stock Update & Audit Logging
            await inventoryService.updateStock(item.productId, -item.quantity, {
                type: 'sale',
                action: 'ITEM_SOLD',
                referenceId: order.id,
                performedBy: orderData.billedBy,
                notes: `Sold via POS Order #${order.orderNumber}`,
                tx
            });

            // Update product status to 'sold'
            await tx.product.update({
                where: { id: item.productId },
                data: {
                    status: 'sold',
                    // Note: sales field not explicitly defined in Prisma, skipping it if not present
                }
            });
        }

        // 6. Update Daily Cashbook
        if (totalCash > 0 && cashbookService.updateCashbookOnEventPrisma) {
            await cashbookService.updateCashbookOnEventPrisma(storeId, totalCash, 'cash', 'sale', tx);
        }
        if (totalOnline > 0 && cashbookService.updateCashbookOnEventPrisma) {
            await cashbookService.updateCashbookOnEventPrisma(storeId, totalOnline, 'upi', 'sale', tx);
        }

        // 7. Handle Customer Credit (Udhar)
        if (totalCredit > 0) {
            if (!orderData.customerId) throw new Error('Customer ID is required for credit (Udhar) sales');

            if (cashbookService.updateCashbookOnEventPrisma) {
                await cashbookService.updateCashbookOnEventPrisma(storeId, totalCredit, 'credit', 'sale', tx);
            }

            if (ledgerService.recordTransactionPrisma) {
                await ledgerService.recordTransactionPrisma({
                    customerId: orderData.customerId,
                    type: 'debit',
                    amount: totalCredit,
                    transactionType: 'sale',
                    referenceId: order.id,
                    referenceModel: 'POSOrder',
                    notes: `Credit sale from Order ${order.orderNumber}`,
                    performedBy: orderData.billedBy
                }, tx);
            }
        }

        // 8. Award loyalty points & send Email
        if (orderData.customerId) {
            const user = await tx.user.findUnique({ where: { id: orderData.customerId } });
            if (user) {
                // Not in same tx if using external mongoose service, but assuming it uses Prisma now
                if (loyaltyService.awardPointsPrisma) {
                    await loyaltyService.awardPointsPrisma(user.id, orderData.grandTotal, tx);
                }

                // Dispatch Email
                if (user.email) {
                    try {
                        const emailContent = generatePOSBillEmail(order, user.name || 'Valued Customer');
                        await sendEmail({
                            to: user.email,
                            emailType: 'customer',
                            subject: emailContent.subject,
                            text: emailContent.text,
                            html: emailContent.html
                        });
                    } catch (err) {
                        console.error(`Failed to queue POS email for ${user.email}: ${err.message}`);
                    }
                }
            }
        }

        return order;
    }, { maxWait: 10000, timeout: 30000 });
};

const getStoreOrders = async (shop_id, query = {}) => {
    const { page = 1, limit = 20, search = '', startDate, endDate } = query;
    const skip = (Number(page) - 1) * Number(limit);

    // Resolve store UUID
    let storeId = shop_id;
    const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(shop_id);
    if (!isUUID) {
        const store = await prisma.store.findUnique({ where: { shop_id } });
        if (store) storeId = store.id;
    }

    const where = { storeId: storeId };

    if (startDate && endDate) {
        where.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
    }

    if (search) {
        where.OR = [
            { orderNumber: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { customer: { phone: { contains: search, mode: 'insensitive' } } }
        ];
    }

    const items = await prisma.pOSOrder.findMany({
        where,
        include: {
            staff: { select: { name: true } },
            customer: { select: { id: true, name: true, phone: true, email: true, addresses: true } },
            items: { include: { product: { include: { metalDetails: true, stoneDetails: true } } } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
    });

    const total = await prisma.pOSOrder.count({ where });

    return {
        items,
        pagination: {
            totalItems: total,
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit))
        }
    };
};

const getOrderById = async (id) => {
    return await prisma.pOSOrder.findUnique({
        where: { id },
        include: {
            staff: { select: { name: true } },
            customer: true,
            items: { include: { product: { include: { metalDetails: true, stoneDetails: true } } } }
        }
    });
};

const getStoreAnalytics = async (shop_id, startDate, endDate, includeOnline = false) => {
    // Resolve store UUID
    let storeId = undefined;
    if (shop_id) {
        storeId = shop_id;
        const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(shop_id);
        if (!isUUID) {
            const store = await prisma.store.findUnique({ where: { shop_id } });
            if (store) storeId = store.id;
        }
    }

    const stats = await prisma.pOSOrder.aggregate({
        where: {
            ...(storeId ? { storeId: storeId } : {}),
            createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
            status: 'completed'
        },
        _sum: {
            grandTotal: true,
            taxTotal: true
        },
        _count: {
            id: true
        }
    });

    const imitationStats = await prisma.imitationSale.aggregate({
        where: {
            createdAt: { gte: new Date(startDate), lte: new Date(endDate) }
        },
        _sum: { grandTotal: true },
        _count: { id: true }
    });

    const creditMemoStats = await prisma.creditMemo.aggregate({
        where: {
            createdAt: { gte: new Date(startDate), lte: new Date(endDate) }
        },
        _sum: { originalAmount: true },
        _count: { id: true }
    });

    // Dynamic Chart Grouping Logic
    const diffTime = Math.abs(new Date(endDate) - new Date(startDate));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const posOrdersRaw = await prisma.pOSOrder.findMany({
        where: { ...(storeId ? { storeId: storeId } : {}), createdAt: { gte: new Date(startDate), lte: new Date(endDate) }, status: 'completed' },
        select: { createdAt: true, grandTotal: true, customerId: true },
        orderBy: { createdAt: 'asc' }
    });

    const uniqueCustomerIds = new Set();
    posOrdersRaw.forEach(order => {
        if (order.customerId) {
            uniqueCustomerIds.add(order.customerId);
        }
    });
    const totalCustomers = uniqueCustomerIds.size;


    const imitationSalesRaw = await prisma.imitationSale.findMany({
        where: { createdAt: { gte: new Date(startDate), lte: new Date(endDate) } },
        select: { createdAt: true, grandTotal: true },
        orderBy: { createdAt: 'asc' }
    });

    const creditMemosRaw = await prisma.creditMemo.findMany({
        where: { createdAt: { gte: new Date(startDate), lte: new Date(endDate) } },
        select: { createdAt: true, originalAmount: true },
        orderBy: { createdAt: 'asc' }
    });

    const onlineOrdersRaw = includeOnline ? await prisma.order.findMany({
        where: { createdAt: { gte: new Date(startDate), lte: new Date(endDate) }, paymentStatus: 'completed' },
        select: { createdAt: true, grandTotal: true },
        orderBy: { createdAt: 'asc' }
    }) : [];

    const groupMultiData = (posData, onlineData) => {
        const map = new Map();

        const processData = (data, key) => {
            data.forEach(item => {
                const date = new Date(item.createdAt);
                let label = '';
                if (diffDays <= 1) {
                    const hr = date.getHours();
                    label = `${hr % 12 || 12}${hr < 12 ? 'am' : 'pm'}`;
                } else if (diffDays <= 7) {
                    label = date.toLocaleDateString('en-US', { weekday: 'short' });
                } else if (diffDays <= 31) {
                    label = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                } else {
                    label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                }

                if (!map.has(label)) {
                    map.set(label, { name: label, sales: 0, onlineSales: 0 });
                }
                map.get(label)[key] += Number(item.grandTotal || 0);
            });
        };

        processData(posData, 'sales');
        if (onlineData) {
            processData(onlineData, 'onlineSales');
        }

        const arr = Array.from(map.values());
        return arr.length > 0 ? arr : [{ name: 'No Data', sales: 0, onlineSales: 0 }];
    };

    const groupData = (data, valueKey) => {
        const map = new Map(); // using Map to preserve insertion order
        data.forEach(item => {
            const date = new Date(item.createdAt);
            let label = '';

            if (diffDays <= 1) {
                const hr = date.getHours();
                label = `${hr % 12 || 12}${hr < 12 ? 'am' : 'pm'}`;
            } else if (diffDays <= 7) {
                label = date.toLocaleDateString('en-US', { weekday: 'short' });
            } else if (diffDays <= 31) {
                label = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
            } else {
                label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            }

            map.set(label, (map.get(label) || 0) + Number(item[valueKey] || 0));
        });

        const arr = Array.from(map, ([name, sales]) => ({ name, sales }));
        return arr.length > 0 ? arr : [{ name: 'No Data', sales: 0 }];
    };

    const charts = {
        gold: groupMultiData(posOrdersRaw, onlineOrdersRaw),
        imitation: groupData(imitationSalesRaw, 'grandTotal'),
        credit: groupData(creditMemosRaw, 'originalAmount')
    };

    return [{
        totalSales: stats._sum.grandTotal || 0,
        orderCount: stats._count.id || 0,
        totalGST: stats._sum.taxTotal || 0,
        imitationSalesTotal: imitationStats._sum.grandTotal || 0,
        imitationCount: imitationStats._count.id || 0,
        creditMemoTotal: creditMemoStats._sum.originalAmount || 0,
        creditMemoCount: creditMemoStats._count.id || 0,
        totalCustomers: totalCustomers || 0,
        charts
    }];
};

const processReturn = async (orderId, returnData, performedBy) => {
    return await prisma.$transaction(async (tx) => {
        const order = await tx.pOSOrder.findUnique({
            where: { id: orderId },
            include: { items: { include: { product: true } } }
        });

        if (!order) throw new Error('Order not found');
        if (order.status === 'REFUNDED') throw new Error('Order is already fully refunded');

        let refundTotal = 0;

        for (const returnItem of returnData.items) {
            const orderItem = order.items.find(i => i.id === returnItem.itemId);
            if (!orderItem) throw new Error(`Item ${returnItem.itemId} not found in order`);

            // Check if already returned using notes or additional fields if added to schema
            // For now assume we process valid items
            refundTotal += Number(orderItem.totalPrice);

            // Update Stock
            await inventoryService.updateStock(orderItem.productId, orderItem.quantity, {
                type: 'adjustment',
                action: 'RETURN',
                referenceId: order.id,
                performedBy: performedBy,
                notes: `Returned via POS Order #${order.orderNumber}. Reason: ${returnItem.reason}`,
                tx
            });

            await tx.product.update({
                where: { id: orderItem.productId },
                data: { status: 'qc_pending' }
            });
        }

        // Add refund payment tracking (if schema supports it, we skip for now or use notes)
        const updatedNotes = (order.notes || '') + ` | Refunded ${refundTotal} via ${returnData.refundMethod}`;

        // Accounting
        if (returnData.refundMethod === 'cash' && cashbookService.updateCashbookOnEventPrisma) {
            await cashbookService.updateCashbookOnEventPrisma(order.storeId, refundTotal, 'cash', 'refund', tx);
        } else if (returnData.refundMethod === 'credit') {
            if (!order.customerId) throw new Error('Customer ID is required for Store Credit refund');

            if (cashbookService.updateCashbookOnEventPrisma) {
                await cashbookService.updateCashbookOnEventPrisma(order.storeId, refundTotal, 'credit', 'refund', tx);
            }

            if (ledgerService.recordTransactionPrisma) {
                await ledgerService.recordTransactionPrisma({
                    customerId: order.customerId,
                    type: 'credit',
                    amount: refundTotal,
                    transactionType: 'refund',
                    referenceId: order.id,
                    referenceModel: 'POSOrder',
                    notes: `Store credit from returned Order ${order.orderNumber}`,
                    performedBy: performedBy
                }, tx);
            }
        }

        const updatedOrder = await tx.pOSOrder.update({
            where: { id: order.id },
            data: {
                status: 'PARTIALLY_REFUNDED', // Simplified
                notes: updatedNotes
            }
        });

        return updatedOrder;
    }, { maxWait: 10000, timeout: 30000 });
};

const updateOrder = async (orderId, orderData) => {
    return await prisma.$transaction(async (tx) => {
        const existingOrder = await tx.pOSOrder.findUnique({
            where: { id: orderId },
            include: { items: true }
        });
        if (!existingOrder) throw new Error('Order not found');

        // Restore old stock
        for (const item of existingOrder.items) {
            await inventoryService.updateStock(item.productId, item.quantity, {
                type: 'adjustment',
                action: 'POS_ORDER_EDIT',
                referenceId: existingOrder.id,
                performedBy: orderData.billedBy,
                notes: 'Restored stock for POS order edit',
                tx
            });
            await tx.product.update({
                where: { id: item.productId },
                data: { status: 'available' }
            });
        }

        // Delete old items
        await tx.pOSOrderItem.deleteMany({ where: { posOrderId: orderId } });

        // Calculate new payments
        let totalCash = 0;
        let totalOnline = 0;
        let totalCredit = 0;

        for (const payment of orderData.payments || []) {
            if (payment.method === 'cash') totalCash += payment.amount;
            else if (['card', 'upi', 'online', 'bank_transfer', 'neft_rtgs', 'neft', 'rtgs'].includes(payment.method)) totalOnline += payment.amount;
            else if (payment.method === 'credit' || payment.method === 'udhar') totalCredit += payment.amount;
        }

        // Update the order details
        const updatedOrder = await tx.pOSOrder.update({
            where: { id: orderId },
            data: {
                customerId: orderData.customerId || null,
                staffId: orderData.billedBy,
                subTotal: orderData.subTotal || 0,
                taxTotal: orderData.totalGST || 0,
                discountTotal: orderData.discount || 0,
                grandTotal: orderData.grandTotal || 0,
                cashPaid: totalCash,
                cardPaid: totalOnline,
                upiPaid: 0,
                creditUsed: totalCredit,
                notes: orderData.notes,
                items: {
                    create: orderData.items.map(item => ({
                        productId: item.product || item.productId || item.id, // accommodate payload formats
                        quantity: 1,
                        unitPrice: item.price || item.unitPrice || 0,
                        metalRate: item.goldRateAtTime || item.metalRate || orderData.metalRate || orderData.currentRate || 0,
                        discount: item.discount || 0,
                        taxAmount: item.taxAmount || 0,
                        totalPrice: item.totalAmount || item.totalPrice || 0
                    }))
                }
            },
            include: { items: true }
        });

        // Deduct new stock
        for (const item of updatedOrder.items) {
            await inventoryService.updateStock(item.productId, -item.quantity, {
                type: 'sale',
                action: 'POS_ORDER_EDIT',
                referenceId: updatedOrder.id,
                performedBy: orderData.billedBy,
                notes: 'Sold via Edited POS Order',
                tx
            });
            await tx.product.update({
                where: { id: item.productId },
                data: { status: 'sold' }
            });
        }

        // Reconcile Ledgers / Cashbook
        const cashDiff = totalCash - Number(existingOrder.cashPaid);
        if (cashDiff !== 0 && cashbookService.updateCashbookOnEventPrisma) {
            await cashbookService.updateCashbookOnEventPrisma(existingOrder.storeId, cashDiff, 'cash', cashDiff > 0 ? 'sale' : 'refund', tx);
        }

        const onlineDiff = totalOnline - Number(existingOrder.cardPaid);
        if (onlineDiff !== 0 && cashbookService.updateCashbookOnEventPrisma) {
            await cashbookService.updateCashbookOnEventPrisma(existingOrder.storeId, onlineDiff, 'upi', onlineDiff > 0 ? 'sale' : 'refund', tx);
        }

        const creditDiff = totalCredit - Number(existingOrder.creditUsed);
        if (creditDiff !== 0) {
            if (!orderData.customerId && creditDiff > 0) throw new Error('Customer ID required for credit sales');
            if (cashbookService.updateCashbookOnEventPrisma) {
                await cashbookService.updateCashbookOnEventPrisma(existingOrder.storeId, creditDiff, 'credit', creditDiff > 0 ? 'sale' : 'refund', tx);
            }
            if (ledgerService.recordTransactionPrisma && orderData.customerId) {
                await ledgerService.recordTransactionPrisma({
                    customerId: orderData.customerId,
                    type: creditDiff > 0 ? 'debit' : 'credit',
                    amount: Math.abs(creditDiff),
                    transactionType: 'sale',
                    referenceId: updatedOrder.id,
                    referenceModel: 'POSOrder',
                    notes: 'Credit adjustment for POS Order Edit',
                    performedBy: orderData.billedBy
                }, tx);
            }
        }

        return await getOrderById(existingOrder.id);
    }, { maxWait: 10000, timeout: 30000 });
};

const checkUtrAvailability = async (utr) => {
    const dup = await findDuplicateUtr(prisma, utr);
    if (dup && dup.isDuplicate) {
        return { isAvailable: false, message: dup.message, details: dup };
    }
    return { isAvailable: true, message: 'UTR number is available and valid.' };
};

module.exports = {
    createOrder,
    updateOrder,
    getStoreOrders,
    getOrderById,
    getStoreAnalytics,
    processReturn,
    calculateCartPrice,
    checkUtrAvailability
};
