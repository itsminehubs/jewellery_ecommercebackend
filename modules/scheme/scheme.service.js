const prisma = require('../../config/prisma');
const { validateAndCheckDuplicateUtr } = require('../../utils/utrValidator');
const { generateSchemeNumber } = require('../../utils/invoiceNumberGenerator');
const { cacheHelper } = require('../../config');
const crypto = require('crypto');
const ApiError = require('../../utils/ApiError');
const { createRazorpayOrder, fetchPayment } = require('../../config/razorpay');
const MANAGEMENT_PHONE = process.env.MANAGEMENT_SCHEME_OTP_PHONE || '7887973088';

const parseSchemeDetails = (scheme) => {
    if (!scheme) return null;
    let metadata = {};
    try {
        if (scheme.notes && scheme.notes.trim().startsWith('{')) {
            metadata = JSON.parse(scheme.notes);
        }
    } catch (e) {
        metadata = {};
    }

    const minMonthlyInstallment = metadata.minMonthlyInstallment != null 
        ? Number(metadata.minMonthlyInstallment) 
        : Number(scheme.monthlyInstallment);

    let applicablePurities = metadata.applicablePurities;
    if (!applicablePurities) {
        applicablePurities = scheme.purity ? [scheme.purity] : ['22K', '18K', '14K'];
    } else if (typeof applicablePurities === 'string') {
        applicablePurities = applicablePurities.split(',').map(p => p.trim());
    }

    const accumulatedGrams = Number(Number(scheme.accumulatedGrams || 0).toFixed(4));
    const redeemedGrams = Number(Number(scheme.redeemedGrams || 0).toFixed(4));
    const remainingGrams = Number(Math.max(0, accumulatedGrams - redeemedGrams).toFixed(4));
    const totalPaid = Number(scheme.totalPaid || 0);

    // Weighted average purchase rate from ledger lots: Total Paid / Total Accumulated Grams
    const weightedAverageRate = accumulatedGrams > 0 
        ? Number((totalPaid / accumulatedGrams).toFixed(2)) 
        : 0;

    const kycType = (metadata.panNumber || scheme.customer?.panNumber) && metadata.aadhaarNumber 
        ? 'PAN & AADHAAR' 
        : ((metadata.panNumber || scheme.customer?.panNumber) ? 'PAN' : (metadata.aadhaarNumber ? 'AADHAAR' : 'KYC_VERIFIED'));

    // Format installments with 4-decimal precision for gramsCredited
    const installments = (scheme.installments || []).map(inst => ({
        ...inst,
        gramsCredited: inst.gramsCredited != null ? Number(Number(inst.gramsCredited).toFixed(4)) : null,
        goldRateApplied: inst.goldRateApplied != null ? Number(Number(inst.goldRateApplied).toFixed(2)) : null
    }));

    return {
        ...scheme,
        accumulatedGrams,
        redeemedGrams,
        remainingGrams,
        totalPaid,
        weightedAverageRate,
        installments,
        minMonthlyInstallment,
        applicablePurities,
        applicablePuritiesText: Array.isArray(applicablePurities) ? applicablePurities.join(', ') : String(applicablePurities),
        kycType,
        hasBankDetails: Boolean(metadata.bankAccount),
        metadata
    };
};

const getPurityAliases = (purity) => {
    if (!purity) return [];
    const p = String(purity).trim().toUpperCase();
    if (p === '22K' || p === '916' || p === '22KT') return ['22K', '916', '22KT'];
    if (p === '18K' || p === '750' || p === '18KT') return ['18K', '750', '18KT'];
    if (p === '14K' || p === '585' || p === '14KT') return ['14K', '585', '14KT'];
    if (p === '24K' || p === '999' || p === '24KT') return ['24K', '999', '24KT'];
    return [p];
};

const enrollCustomer = async (data) => {
    // --- Load store-level scheme settings (configured by admin/superadmin) ---
    let storeSchemeSettings = {};
    try {
        let store = await prisma.store.findUnique({ where: { shop_id: data.shop_id } });
        if (!store) {
            // If enrolled online or shop_id not found, fall back to primary physical store settings
            store = await prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
        }
        if (store && store.metadata && typeof store.metadata === 'object') {
            storeSchemeSettings = store.metadata.schemeSettings || {};
        }
    } catch (e) {
        // Non-fatal: fall back to in-request values
    }

    // Dynamic tenure entered by admin/superadmin (default 11 months)
    const totalMonths = data.totalMonths
        ? Number(data.totalMonths)
        : (storeSchemeSettings.totalMonths || 11);
    
    // Dynamic Minimum monthly installment entered by admin/superadmin
    // Priority: enrollment-specific override > store setting > fallback 1000
    const storeMinInstallment = storeSchemeSettings.minMonthlyInstallment || 1000;
    const minMonthlyInstallment = Number(
        data.minMonthlyInstallment || data.minInstallment || storeMinInstallment
    );
    const monthlyInstallment = Number(data.monthlyInstallment);

    if (!monthlyInstallment || monthlyInstallment <= 0) {
        throw new Error('Valid monthly installment amount is required.');
    }
    if (monthlyInstallment < minMonthlyInstallment) {
        throw new Error(`Monthly installment cannot be less than the minimum installment of ₹${minMonthlyInstallment.toLocaleString('en-IN')} configured by Admin.`);
    }

    // Individual vs Firm validation
    const customer = await prisma.user.findUnique({
        where: { id: data.customerId }
    });
    if (!customer) throw new Error('Customer not found');

    if (data.isFirm || (customer.gstNumber && data.enrollmentType === 'FIRM')) {
        throw new Error('Scheme enrollment is permitted only in an individual name. Enrollment in a firm name is strictly prohibited.');
    }

    // KYC check: PAN OR Aadhaar - ANY ONE is needed
    const panNumber = (data.panNumber || customer.panNumber || '').trim();
    const aadhaarNumber = (data.aadhaarNumber || '').trim();
    
    if (!panNumber && !aadhaarNumber && !data.aadhaarVerified) {
        throw new Error('KYC Requirement: Either PAN Card or Aadhaar Card is required for scheme enrollment (any one is mandatory).');
    }

    // Dynamic Applicable Purity entered by admin/superadmin (e.g. 22K, 18K, 14K, 24K, 20K, 916)
    // Priority: enrollment-specific > store setting > default
    const storeApplicablePurities = storeSchemeSettings.applicablePurities || ['22K', '18K', '14K'];
    const schemeType = data.schemeType || 'GOLD';
    let purity = data.purity || null;
    let applicablePurities = data.applicablePurities
        ? (typeof data.applicablePurities === 'string'
            ? data.applicablePurities.split(',').map(p => p.trim()).filter(Boolean)
            : data.applicablePurities)
        : storeApplicablePurities;

    if (schemeType === 'GOLD' && !purity && applicablePurities.length > 0) {
        purity = applicablePurities[0];
    }

    // Bonus percentage from store settings
    const bonusPercentage = data.bonusPercentage != null
        ? Number(data.bonusPercentage)
        : (storeSchemeSettings.bonusPercentage != null ? Number(storeSchemeSettings.bonusPercentage) : 100);


    // Update PAN on customer profile if supplied and not already present
    if (panNumber && !customer.panNumber) {
        await prisma.user.update({
            where: { id: customer.id },
            data: { panNumber }
        });
    }

    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + totalMonths);

    // Auto-generate Scheme Invoice Number (Format: CS-SCH-001, CS-SCH-002, etc.)
    const schemeId = await generateSchemeNumber(prisma);

    // Bank details are optional (especially if paying via Razorpay)
    const metadata = {
        minMonthlyInstallment: minMonthlyInstallment || monthlyInstallment,
        applicablePurities,
        purity,
        aadhaarNumber: aadhaarNumber || null,
        panNumber: panNumber || null,
        kycProvided: panNumber ? 'PAN' : 'AADHAAR',
        bankAccount: data.bankAccount || null,
        ifscCode: data.ifscCode || null,
        bankName: data.bankName || null,
        paymentGateway: data.paymentMethod === 'razorpay' ? 'RAZORPAY' : (data.paymentGateway || 'ONLINE_OR_CASH'),
        enrolledAs: 'INDIVIDUAL',
        agreedTerms: true,
        enrolledByRole: data.enrolledByRole || 'admin'
    };

    const scheme = await prisma.scheme.create({
        data: {
            schemeId,
            shopId: data.shop_id || 'ONLINE',
            customerId: data.customerId,
            schemeType,
            purity,
            monthlyInstallment,
            totalMonths,
            bonusPercentage: bonusPercentage,
            maturityDate,
            status: 'active',
            notes: JSON.stringify({ notes: data.notes || '', ...metadata })
        }
    });

    // Create Immutable Audit Log
    await prisma.schemeActivityLog.create({
        data: {
            schemeId: scheme.id,
            action: 'ENROLLMENT',
            description: `Enrolled in ${schemeType} Scheme (${purity || 'N/A'}) for ${totalMonths} months. Min EMI: ₹${minMonthlyInstallment}. Applicable Purities: ${applicablePurities.join(', ')}. KYC: ${metadata.kycProvided}.`,
            details: { 
                monthlyInstallment, 
                minMonthlyInstallment,
                purity, 
                applicablePurities,
                bonusPercentage: scheme.bonusPercentage,
                kyc: { 
                    pan: panNumber ? `****${panNumber.slice(-4)}` : null, 
                    aadhaar: aadhaarNumber ? `****${aadhaarNumber.slice(-4)}` : null 
                },
                metadata
            },
            performedById: data.performedBy
        }
    });

    return parseSchemeDetails(scheme);
};

const recordInstallment = async (schemeId, paymentData, performedBy, userRole = 'staff') => {
    return await prisma.$transaction(async (tx) => {
        const scheme = await tx.scheme.findUnique({
            where: { id: schemeId },
            include: { installments: true }
        });

        if (!scheme) throw new Error('Scheme not found');
        if (scheme.status !== 'active') throw new Error(`Cannot pay installment for scheme in ${scheme.status} status`);

        const isStaff = ['super_admin', 'admin', 'store_manager', 'sales_staff', 'accounts_finance', 'staff'].includes(userRole);
        // Authorization: Non-staff users can only record installments on their own scheme
        if (!isStaff && scheme.customerId !== performedBy) {
            throw new Error('Unauthorized: You can only deposit installments for your own savings scheme.');
        }

        // Security check: Only staff at physical showrooms can record cash deposits
        if (!isStaff && paymentData.method === 'cash') {
            throw new Error('Cash payments cannot be recorded online. Please visit an authorized showroom to pay in cash.');
        }

        const amount = Number(paymentData.amount);
        const monthlyInstallment = Number(scheme.monthlyInstallment);
        const totalMonths = scheme.totalMonths || 11;
        const maxTotalPayable = monthlyInstallment * totalMonths;
        const currentPaid = Number(scheme.totalPaid || 0);

        if (isNaN(amount) || amount <= 0) {
            throw new Error('A valid positive installment amount is required.');
        }

        // Must be an exact multiple of the monthly installment
        if (amount < monthlyInstallment || (Math.round(amount * 100) % Math.round(monthlyInstallment * 100) !== 0)) {
            throw new Error(`Installment amount must be an exact multiple of the monthly installment (₹${monthlyInstallment.toLocaleString('en-IN')}).`);
        }

        // Rule 4: Maximum 5 installments can be paid in a single transaction
        const maxAllowedInSingleTx = monthlyInstallment * 5;
        if (amount > maxAllowedInSingleTx) {
            throw new Error(`A maximum of 5 installments (₹${maxAllowedInSingleTx.toLocaleString('en-IN')}) can be paid in a single transaction.`);
        }

        // Rule: Cannot overpay beyond total tenure amount
        if (currentPaid + amount > maxTotalPayable) {
            const remainingPayable = maxTotalPayable - currentPaid;
            throw new Error(`Payment of ₹${amount.toLocaleString('en-IN')} exceeds the remaining balance for this scheme. Max remaining payable: ₹${remainingPayable.toLocaleString('en-IN')}.`);
        }

        // NEFT / RTGS / Bank Transfer: Mandatory UTR number and duplicate checking
        if (['neft', 'rtgs', 'bank_transfer', 'neft_rtgs'].includes(paymentData.method)) {
            const rawUtr = paymentData.transactionId || paymentData.utrNumber;
            const cleanUtr = await validateAndCheckDuplicateUtr(tx, rawUtr, paymentData.method.toUpperCase());
            paymentData.transactionId = cleanUtr;
        }

        // Rule 15: Maximum cash payment accepted under the scheme is ₹1,99,900
        if (paymentData.method === 'cash') {
            if (amount > 199900) {
                throw new Error('The maximum cash payment accepted under the scheme is ₹1,99,900 as per applicable legal limits.');
            }

            // Calculate total cash already paid in this scheme
            const currentCashPaid = scheme.installments
                .filter(i => i.method === 'cash')
                .reduce((sum, i) => sum + Number(i.amount), 0);

            if (currentCashPaid + amount > 199900) {
                throw new Error(`Cumulative cash payments cannot exceed ₹1,99,900 under the scheme. Currently paid: ₹${currentCashPaid.toLocaleString('en-IN')}.`);
            }
        }

        // Rule 2: Monthly installments are scheduled between the 1st and 10th of every month.
        const currentDay = new Date().getDate();
        const isWithinWindow = currentDay >= 1 && currentDay <= 10;

        let goldRateApplied = null;
        let gramsCredited = null;

        // Rule 6 & 8: Frozen gold rate at time of each installment payment for 22K/18K/14K
        // Strictly uses dedicated Scheme Gold Rate table (tx.schemeGoldRate) with fallback to goldRate
        if (scheme.schemeType === 'GOLD' && scheme.purity) {
            const aliases = getPurityAliases(scheme.purity);
            let rateRecord = await tx.schemeGoldRate.findFirst({
                where: {
                    metal: { equals: 'gold', mode: 'insensitive' },
                    purity: { in: aliases, mode: 'insensitive' }
                },
                orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }]
            });

            // Fallback to active goldRate table if dedicated schemeGoldRate is not configured yet
            if (!rateRecord || Number(rateRecord.ratePerGram) <= 0) {
                rateRecord = await tx.goldRate.findFirst({
                    where: {
                        metal: { equals: 'gold', mode: 'insensitive' },
                        purity: { in: aliases, mode: 'insensitive' }
                    },
                    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }]
                });
            }

            if (!rateRecord || Number(rateRecord.ratePerGram) <= 0) {
                throw new Error(`Live gold rate not set for ${scheme.purity}. Please configure gold rates in Gold Rate settings.`);
            }
            
            goldRateApplied = Number(Number(rateRecord.ratePerGram).toFixed(2));
            gramsCredited = Number((amount / goldRateApplied).toFixed(4));
        }

        const newInstallment = await tx.schemeInstallment.create({
            data: {
                schemeId: scheme.id,
                amount,
                goldRateApplied,
                gramsCredited,
                method: paymentData.method,
                transactionId: paymentData.transactionId,
                notes: paymentData.notes || (isWithinWindow ? 'Paid on schedule (1-10 window)' : 'Installment payment'),
                collectedById: performedBy
            }
        });

        const newTotalPaid = Number(scheme.totalPaid) + amount;
        const monthsPaidCovered = Math.round(newTotalPaid / monthlyInstallment);
        
        let newStatus = scheme.status;
        if (monthsPaidCovered >= totalMonths || newTotalPaid >= maxTotalPayable) {
            newStatus = 'matured';
        }

        const newAccumulatedGrams = scheme.schemeType === 'GOLD' 
            ? Number((Number(scheme.accumulatedGrams) + (gramsCredited || 0)).toFixed(4))
            : 0;

        const updatedScheme = await tx.scheme.update({
            where: { id: scheme.id },
            data: {
                totalPaid: newTotalPaid,
                accumulatedGrams: newAccumulatedGrams,
                status: newStatus
            }
        });

        // Add Immutable Audit Log for Payment
        await tx.schemeActivityLog.create({
            data: {
                schemeId: scheme.id,
                action: 'INSTALLMENT',
                description: `Paid ₹${amount.toLocaleString('en-IN')} covering ${monthsPaidCovered}/${totalMonths} months via ${paymentData.method.toUpperCase()}. Rate frozen at ₹${goldRateApplied || 'N/A'}/g.`,
                details: {
                    amount,
                    method: paymentData.method,
                    transactionId: paymentData.transactionId,
                    goldRateApplied,
                    gramsCredited,
                    newAccumulatedGrams,
                    monthsPaidCovered,
                    paymentWindowDay: currentDay,
                    isLateWithGrace: !isWithinWindow
                },
                performedById: performedBy
            }
        });

        // Update Cashbook for the physical store if payment is in-store
        const activeShopId = paymentData.shop_id || (scheme.shopId && scheme.shopId !== 'ONLINE' ? scheme.shopId : null);
        if (isStaff && activeShopId && activeShopId !== 'ONLINE' && ['cash', 'upi', 'card', 'bank_transfer', 'neft_rtgs', 'neft', 'rtgs'].includes(paymentData.method)) {
            const cashbookService = require('../accounting/cashbook.service');
            if (cashbookService.updateCashbookOnEventPrisma) {
                await cashbookService.updateCashbookOnEventPrisma(
                    activeShopId, 
                    amount, 
                    paymentData.method, 
                    'sale',
                    tx
                );
            }
        }

        return updatedScheme;
    });
};

const getStoreSchemes = async (shopId, filter = {}) => {
    const { shop_id, page, limit, search, status, allStores, ...cleanFilter } = filter;

    // Cross-store & Online Lookup:
    // If querying by customerId, active search (phone/schemeId), or allStores flag is set,
    // do not scope to a specific shopId so customers who enrolled online or at other branches
    // can be serviced, billed, and redeemed at any physical showroom counter.
    const isGlobalLookup = Boolean(
        cleanFilter.customerId ||
        (search && String(search).trim()) ||
        allStores === 'true' ||
        allStores === true
    );
    const effectiveShopId = isGlobalLookup || shopId === 'all' || !shopId ? undefined : shopId;

    const where = {
        ...(effectiveShopId ? { shopId: effectiveShopId } : {}),
        ...(status && status !== 'all' ? { status } : {}),
        ...cleanFilter
    };

    if (search && String(search).trim()) {
        const term = String(search).trim();
        where.OR = [
            { schemeId: { contains: term, mode: 'insensitive' } },
            { customer: { name: { contains: term, mode: 'insensitive' } } },
            { customer: { phone: { contains: term, mode: 'insensitive' } } }
        ];
    }

    const schemes = await prisma.scheme.findMany({
        where,
        include: {
            customer: { select: { id: true, name: true, phone: true, email: true, panNumber: true } },
            installments: true
        },
        orderBy: { createdAt: 'desc' }
    });

    return schemes.map(parseSchemeDetails);
};

const getUserSchemeStatements = async (customerId) => {
    const schemes = await prisma.scheme.findMany({
        where: { customerId },
        include: {
            activityLogs: {
                orderBy: { createdAt: 'desc' },
                include: { performedBy: { select: { name: true } } }
            },
            installments: {
                orderBy: { createdAt: 'desc' }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    return schemes.map(parseSchemeDetails);
};

const getSchemeById = async (schemeId) => {
    const scheme = await prisma.scheme.findUnique({
        where: { id: schemeId },
        include: {
            customer: { select: { id: true, name: true, phone: true, email: true, panNumber: true } },
            installments: {
                orderBy: { createdAt: 'desc' }
            },
            activityLogs: {
                orderBy: { createdAt: 'desc' },
                include: { performedBy: { select: { name: true } } }
            }
        }
    });

    return parseSchemeDetails(scheme);
};

const updateScheme = async (schemeId, updateData, performedBy) => {
    const scheme = await prisma.scheme.findUnique({ where: { id: schemeId } });
    if (!scheme) throw new Error('Scheme not found');

    let currentMetadata = {};
    try {
        if (scheme.notes && scheme.notes.trim().startsWith('{')) {
            currentMetadata = JSON.parse(scheme.notes);
        }
    } catch (e) {}

    if (updateData.minMonthlyInstallment != null) {
        currentMetadata.minMonthlyInstallment = Number(updateData.minMonthlyInstallment);
    }
    if (updateData.applicablePurities) {
        currentMetadata.applicablePurities = Array.isArray(updateData.applicablePurities)
            ? updateData.applicablePurities
            : String(updateData.applicablePurities).split(',').map(s => s.trim());
    }

    const updated = await prisma.scheme.update({
        where: { id: schemeId },
        data: {
            status: updateData.status || scheme.status,
            purity: updateData.purity || scheme.purity,
            notes: JSON.stringify({ ...currentMetadata, notes: updateData.notes || currentMetadata.notes || '' }),
            monthlyInstallment: updateData.monthlyInstallment != null ? Number(updateData.monthlyInstallment) : scheme.monthlyInstallment
        }
    });

    await prisma.schemeActivityLog.create({
        data: {
            schemeId: scheme.id,
            action: 'UPDATE',
            description: `Scheme updated by Admin. Min EMI: ₹${currentMetadata.minMonthlyInstallment || scheme.monthlyInstallment}.`,
            details: updateData,
            performedById: performedBy
        }
    });

    return parseSchemeDetails(updated);
};

const deleteScheme = async (schemeId, performedBy) => {
    // Rule 25: Once enrolled, the scheme cannot be cancelled or refunded
    const scheme = await prisma.scheme.findUnique({ 
        where: { id: schemeId },
        include: { installments: true }
    });
    if (!scheme) throw new Error('Scheme not found');

    if (scheme.installments && scheme.installments.length > 0) {
        throw new Error('Rule 25 Violation: Once enrolled and installments paid, the scheme cannot be cancelled or refunded. Amount can only be utilized towards gold jewellery purchase.');
    }

    const cancelled = await prisma.scheme.update({
        where: { id: schemeId },
        data: {
            status: 'cancelled',
            notes: 'Zero-installment scheme cancelled by Admin'
        }
    });

    await prisma.schemeActivityLog.create({
        data: {
            schemeId: scheme.id,
            action: 'CANCEL',
            description: `Scheme strictly cancelled before any installment was paid.`,
            details: { reason: 'Admin Intervention' },
            performedById: performedBy
        }
    });

    return parseSchemeDetails(cancelled);
};

/**
 * Calculates Scheme Benefit and Redemption Eligibility based on the 27 Rules:
 * - Dynamic Minimum Installment & Dynamic Applicable Purities configured by Admin
 * - Rule 5: Purchase allowed only after completion of 330 days from enrollment.
 * - Rule 13 & User Rule:
 *     - If < half tenure (< 50% tenure, e.g. < 6 months for 11/12m): 0% benefit.
 *     - If >= half tenure but < full tenure (e.g. 6 to 10 months for 11m): 50% of eligible benefit.
 *     - If full tenure complete (11 months): 100% of eligible benefit.
 * - Rule 22: Window is between 330 and 345 days. From 345 to 365 days eligible. 
 *     After 365 days: Auto-closure with 0% benefit and principal returned.
 */
/**
 * Calculates Scheme Benefit and Redemption Eligibility based on the 4 Tiers & Rules:
 * - Tenure, min installment, and discount percentages configured by Management.
 * - Tier 1: Less than 6 months (180 days): 0% benefit. Early redemption permitted (not strictly blocked).
 * - Tier 2: Between 6 months and 11 months (180 to 329 days):
 *           Gold: Up to 50% discount on making charges (or management configured).
 *           Diamond: Flat 20% discount on diamonds & flat 20% discount on making charges.
 * - Tier 3: 330 to 364 days (Full tenure): Full benefits!
 *           Gold: Up to 100% discount on making charges (or management configured).
 *           Diamond: Flat 40% discount on diamonds & flat 40% discount on making charges.
 * - Tier 4: 365+ days: Auto-closure / expiration with 0% benefits. Principal protected.
 * - STRICT RULE: NO extra bonus gold weight in grams in any tenure (only making charge discount).
 * - STRICT RULE: NO cash installment bonus in diamond (only diamond & making charge discounts).
 */
const calculateRedemptionValue = (schemeRaw, quoteGoldRate = null, storeSettings = {}) => {
    const scheme = parseSchemeDetails(schemeRaw);
    if (!scheme) return { error: 'Scheme not found' };

    if (scheme.status === 'redeemed' || scheme.status === 'closed') {
        return { 
            isEligible: false,
            error: 'Scheme already redeemed or closed',
            status: scheme.status
        };
    }

    const monthlyInstallment = Number(scheme.monthlyInstallment || 1);
    const totalPaid = Number(scheme.totalPaid || 0);
    const totalMonths = scheme.totalMonths || 11;
    const paidInstallmentCount = Math.min(totalMonths, Math.floor(totalPaid / (monthlyInstallment > 0 ? monthlyInstallment : 1)));

    // Calculate days elapsed since enrollment
    const enrollmentDate = new Date(scheme.startDate || scheme.createdAt);
    const today = new Date();
    const daysSinceEnrollment = Math.floor((today - enrollmentDate) / (1000 * 60 * 60 * 24));

    // 4 Duration Tiers
    const isPast365Days = daysSinceEnrollment >= 365;
    const isUnder6Months = daysSinceEnrollment < 180;
    const isHalfTenure = daysSinceEnrollment >= 180 && daysSinceEnrollment < 330;
    const isFullTenure = daysSinceEnrollment >= 330 && daysSinceEnrollment < 365;

    // Configurable discounts from management (store settings or scheme metadata defaults)
    const settings = {
        goldMakingDiscountUpToHalf: 50,
        goldMakingDiscountUpToFull: 100,
        diamondFlatDiscountHalf: 20,
        diamondMakingFlatDiscountHalf: 20,
        diamondFlatDiscountFull: 40,
        diamondMakingFlatDiscountFull: 40,
        ...storeSettings,
        ...(scheme.metadata || {})
    };

    let benefitRatio = 0;
    let benefitTier = 'NO_BENEFIT';
    let goldMakingDiscount = 0;
    let diamondDiscount = 0;
    let diamondMakingDiscount = 0;

    if (isPast365Days) {
        benefitTier = 'EXPIRED_AFTER_365_DAYS_NO_BENEFIT';
        benefitRatio = 0;
    } else if (isUnder6Months) {
        benefitTier = 'TENURE_UNDER_6_MONTHS_ZERO_BENEFIT';
        benefitRatio = 0;
    } else if (isHalfTenure) {
        benefitTier = 'TENURE_6_TO_11_MONTHS_PARTIAL_BENEFIT';
        benefitRatio = 0.5;
        goldMakingDiscount = Number(settings.goldMakingDiscountUpToHalf || 50);
        diamondDiscount = Number(settings.diamondFlatDiscountHalf || 20);
        diamondMakingDiscount = Number(settings.diamondMakingFlatDiscountHalf || 20);
    } else if (isFullTenure) {
        benefitTier = 'FULL_TENURE_FULL_BENEFIT';
        benefitRatio = 1.0;
        goldMakingDiscount = Number(settings.goldMakingDiscountUpToFull || 100);
        diamondDiscount = Number(settings.diamondFlatDiscountFull || 40);
        diamondMakingDiscount = Number(settings.diamondMakingFlatDiscountFull || 40);
    }

    const canPurchaseNow = true; // Redemptions before 6 months are allowed according to rules, not strictly blocked!
    const isOptimalClosureWindow = daysSinceEnrollment >= 330 && daysSinceEnrollment <= 345;
    const isExtendedGraceWindow = daysSinceEnrollment > 345 && daysSinceEnrollment < 365;

    const accumulatedGrams = Number(scheme.accumulatedGrams || 0);
    const minMonthlyInstallment = scheme.minMonthlyInstallment || Number(scheme.monthlyInstallment);
    const applicablePurities = scheme.applicablePurities || (scheme.purity ? [scheme.purity] : ['22K', '18K', '14K']);

    if (scheme.schemeType === 'GOLD') {
        const remainingGrams = scheme.remainingGrams != null 
            ? scheme.remainingGrams 
            : Number((accumulatedGrams - (Number(scheme.redeemedGrams) || 0)).toFixed(4));

        // STRICT USER RULE: NO extra bonus gold weight in grams in any tenure (only making charge discount)
        const bonusWeightGrams = 0;
        const totalEligibleGrams = remainingGrams;

        const activeGoldRate = quoteGoldRate || scheme.weightedAverageRate || 0;
        const finalRedemptionAmount = Number((totalEligibleGrams * (activeGoldRate > 0 ? activeGoldRate : (accumulatedGrams > 0 ? totalPaid / accumulatedGrams : 0))).toFixed(2));

        return {
            schemeId: scheme.schemeId,
            schemeType: 'GOLD',
            purity: scheme.purity || (applicablePurities[0] || '22K'),
            applicablePurities,
            minMonthlyInstallment,
            monthlyInstallment: Number(scheme.monthlyInstallment),
            daysSinceEnrollment,
            canPurchaseNow,
            isOptimalClosureWindow,
            isExtendedGraceWindow,
            isPast365Days,
            isUnder6Months,
            isHalfTenure,
            isFullTenure,
            paidMonths: paidInstallmentCount,
            totalMonths,
            benefitTier,
            benefitRatio,
            benefitPercentageText: `${benefitRatio * 100}%`,
            totalPaid,
            accumulatedGrams,
            redeemedGrams: scheme.redeemedGrams || 0,
            remainingGrams,
            weightedAverageRate: scheme.weightedAverageRate || 0,
            bonusWeightGrams: 0, // Zero bonus grams
            totalEligibleGrams,
            finalRedemptionAmount: finalRedemptionAmount > 0 ? finalRedemptionAmount : totalPaid,
            makingChargeDiscount: goldMakingDiscount,
            diamondDiscount: 0,
            eligiblePurities: applicablePurities,
            ineligibleItems: ['24K Gold Coins', '24K Gold Bars'],
            razorpaySupported: true,
            notes: isUnder6Months
                ? `Early redemption (under 6 months): Allowed with 0% making charge discount.`
                : (isHalfTenure
                    ? `Half-tenure benefit: Up to ${goldMakingDiscount}% discount on making charges.`
                    : (isFullTenure
                        ? `Full tenure completed: Full ${goldMakingDiscount}% discount on making charges.`
                        : '365 days exceeded. Scheme expired without benefits. Principal refundable.'))
        };
    }

    if (scheme.schemeType === 'DIAMOND') {
        // STRICT USER RULE: NO cash installment bonus in diamond (only diamond & making charge discounts)
        const eligibleBonus = 0;

        return {
            schemeId: scheme.schemeId,
            schemeType: 'DIAMOND',
            minMonthlyInstallment,
            monthlyInstallment: Number(scheme.monthlyInstallment),
            applicablePurities: ['Diamond Jewellery'],
            daysSinceEnrollment,
            canPurchaseNow,
            isOptimalClosureWindow,
            isExtendedGraceWindow,
            isPast365Days,
            isUnder6Months,
            isHalfTenure,
            isFullTenure,
            paidMonths: paidInstallmentCount,
            totalMonths,
            benefitTier,
            benefitRatio,
            benefitPercentageText: `${benefitRatio * 100}%`,
            totalPaid,
            eligibleBonus: 0, // Zero cash bonus
            finalRedemptionAmount: totalPaid,
            makingChargeDiscount: diamondMakingDiscount,
            diamondDiscount: diamondDiscount,
            razorpaySupported: true,
            notes: isUnder6Months
                ? `Early redemption (under 6 months): Allowed with 0% diamond & making charge discount.`
                : (isHalfTenure
                    ? `Half-tenure benefit: Flat ${diamondDiscount}% discount on diamonds & ${diamondMakingDiscount}% discount on making charges.`
                    : (isFullTenure
                        ? `Full tenure completed: Flat ${diamondDiscount}% discount on diamonds & ${diamondMakingDiscount}% discount on making charges.`
                        : '365 days exceeded. Scheme expired without benefits. Principal refundable.'))
        };
    }
};

const SCHEME_TERMS = [
    { id: 1, title: 'Tenure', text: 'The scheme tenure is configured by Admin (Default: 11 months).' },
    { id: 2, title: 'Payment Window', text: 'Monthly installments must be paid between the 1st and 10th of every month.' },
    { id: 3, title: 'Minimum Installment', text: 'The minimum monthly installment is defined dynamically by the store / Admin at enrollment.' },
    { id: 4, title: 'Payment Cap per Transaction', text: 'A maximum of 5 installments can be paid in a single transaction.' },
    { id: 5, title: 'Maturity & Redemption Lock-in', text: 'Jewellery can be purchased after completion of 330 days from the scheme enrollment date.' },
    { id: 6, title: 'Applicable Jewellery Purities', text: 'The applicable purities (e.g. 22K, 18K, 14K, 24K, 916) are configured dynamically by the Admin.' },
    { id: 7, title: 'Bullion Exclusion', text: 'The scheme is not applicable to 24K gold coins or gold bars unless explicitly approved.' },
    { id: 8, title: 'Rate Freezing', text: 'The gold rate will be frozen at the time of each installment payment.' },
    { id: 9, title: 'Mandatory PAN for Large Purchases', text: 'A PAN card is mandatory for purchases exceeding ₹2,00,000, subject to applicable laws.' },
    { id: 10, title: 'Non-transferable Redemption', text: 'Only the person in whose name the scheme is registered can redeem it.' },
    { id: 11, title: 'GST Applicable', text: 'GST will be applicable at the prevailing rate as per applicable laws.' },
    { id: 12, title: 'GST Calculation Basis', text: 'GST will be calculated on the total invoice value before applying the scheme discount, subject to applicable tax laws.' },
    { id: 13, title: 'Tiered Benefit Structure', text: 'Before completion of half tenure: No scheme benefit provided. After completion of half tenure (e.g. 6 months for 11/12m scheme) but before full tenure: 50% eligible benefit. After completion of full tenure: 100% eligible benefit.' },
    { id: 14, title: 'Benefit Limit', text: 'The scheme benefit will be limited to the amount actually paid by the customer, subject to applicable scheme terms.' },
    { id: 15, title: 'Cash Limit', text: 'The maximum cash payment accepted under the scheme is ₹1,99,900, subject to applicable laws.' },
    { id: 16, title: 'Individual Registration Only', text: 'The scheme can be enrolled only in an individual\'s name. Enrollment in a firm\'s name is not permitted.' },
    { id: 17, title: 'Early Redemption Penalty', text: 'No scheme benefit will be provided if the scheme is redeemed before completion of half tenure (6 months).' },
    { id: 18, title: 'Offer Stacking Exclusion', text: 'No additional offers can be combined with the scheme benefit.' },
    { id: 19, title: 'Vouchers Restriction', text: 'Vouchers cannot be combined with the scheme benefit.' },
    { id: 20, title: 'Excess Weight Benefits', text: 'Offers may be applicable to additional jewellery weight purchased beyond the weight covered by the scheme, subject to terms.' },
    { id: 21, title: 'Authorized Outlets', text: 'The scheme can be closed at any authorized outlet of the company.' },
    { id: 22, title: 'Closure Timeline & Auto-Closure', text: 'The scheme must be closed after 345 days from enrolment date. Eligible for closure until 365th day. Automatically closed on completion of 365 days without any scheme benefits; principal transferred to registered bank account or original payment source.' },
    { id: 23, title: 'Mandatory KYC (PAN or Aadhaar)', text: 'Either PAN card or Aadhaar card is required for scheme enrollment KYC (any one is mandatory).' },
    { id: 24, title: 'Default/Delay Impact', text: 'Missing or delaying an installment may affect the customer\'s eligibility for scheme benefits.' },
    { id: 25, title: 'Non-refundable & Non-cancellable', text: 'Once enrolled, the scheme cannot be cancelled. The amount paid cannot be refunded and can only be utilized towards purchase of gold jewellery of applicable purity.' },
    { id: 26, title: 'OTP Verification at Closure', text: 'An OTP will be sent to the registered mobile number at the time of scheme closure. The OTP must be submitted to complete closure.' },
    { id: 27, title: 'Jurisdiction & Disputes', text: 'Any dispute arising out of or in connection with the scheme shall be handled in accordance with the applicable laws of India.' }
];

const getSchemeTerms = () => {
    return SCHEME_TERMS;
};

const getRedemptionQuote = async (schemeId) => {
    const scheme = await getSchemeById(schemeId);
    if (!scheme) throw new Error('Scheme not found');

    let currentGoldRate = null;
    if (scheme.schemeType === 'GOLD' && scheme.purity) {
        const aliases = getPurityAliases(scheme.purity);
        const schemeRate = await prisma.schemeGoldRate.findFirst({
            where: {
                metal: { equals: 'gold', mode: 'insensitive' },
                purity: { in: aliases, mode: 'insensitive' }
            },
            orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }]
        });
        currentGoldRate = schemeRate ? Number(Number(schemeRate.ratePerGram).toFixed(2)) : null;
    }

    const quote = calculateRedemptionValue(scheme, currentGoldRate);
    quote.currentGoldRate = currentGoldRate;
    return quote;
};

const requestClosureOTP = async (schemeId, performedBy) => {
    const scheme = await prisma.scheme.findUnique({
        where: { id: schemeId },
        include: { customer: true }
    });
    if (!scheme) throw new Error('Scheme not found');
    if (scheme.status === 'closed' || scheme.status === 'redeemed') {
        throw new Error('Scheme is already closed or redeemed');
    }

    const otpService = require('../../utils/otpService');
    const otp = await otpService.generateAndStoreOTP(scheme.customer.phone, undefined, 'scheme_closure');

    const isSandbox = process.env.IS_SANDBOX === 'true' || process.env.NODE_ENV !== 'production';

    const result = {
        message: isSandbox
            ? `[SANDBOX] Closure OTP is: ${otp} (or enter 123456)`
            : `Closure OTP sent to registered mobile number ending with ${scheme.customer.phone.slice(-4)}`,
        phoneEnding: scheme.customer.phone.slice(-4),
        otp: isSandbox ? otp : undefined,
        sandboxOtp: isSandbox ? otp : undefined
    };

    await prisma.schemeActivityLog.create({
        data: {
            schemeId: scheme.id,
            action: 'CLOSURE_OTP_REQUESTED',
            description: `Closure OTP requested for mobile ${scheme.customer.phone}`,
            details: { phoneEnding: scheme.customer.phone.slice(-4) },
            performedById: performedBy
        }
    });

    return result;
};

const closeSchemeWithOTP = async (schemeId, otp, managementOtp, closureData, performedBy, userRole = 'staff') => {
    const scheme = await prisma.scheme.findUnique({
        where: { id: schemeId },
        include: { customer: true, installments: true }
    });
    if (!scheme) throw new Error('Scheme not found');
    if (scheme.status === 'closed' || scheme.status === 'redeemed') {
        throw new Error('Scheme is already closed or redeemed');
    }

    const isStaff = ['super_admin', 'admin', 'store_manager', 'sales_staff', 'accounts_finance', 'staff'].includes(userRole);
    if (!isStaff && scheme.customerId !== performedBy) {
        throw new Error('Unauthorized: You can only close your own savings scheme.');
    }

    const otpService = require('../../utils/otpService');

    // Rule 26: Customer OTP Verification
    let customerVerified = false;
    if (cacheHelper) {
        customerVerified = await cacheHelper.get(`scheme_customer_verified_${scheme.id}`);
    }
    if (!customerVerified && !otp) {
        throw new Error('Rule 26 Requirement: Customer OTP verification is required to close scheme.');
    }
    if (otp) {
        await otpService.verifyOTP(scheme.customer.phone, otp, false);
    }

    // Step 2: Management OTP Verification (Sent to 7887973088)
    let mgmtVerified = false;
    if (cacheHelper) {
        mgmtVerified = await cacheHelper.get(`scheme_mgmt_verified_${scheme.id}`);
    }
    if (!mgmtVerified && !managementOtp) {
        throw new Error(`Management Authorization Required: Management OTP verification sent to ${MANAGEMENT_PHONE} is mandatory to close and redeem scheme.`);
    }
    if (managementOtp) {
        let isMgmtValid = false;
        try {
            await otpService.verifyOTP(`scheme_mgmt_otp_${scheme.id}`, String(managementOtp).trim(), false);
            isMgmtValid = true;
        } catch (e) {
            try {
                await otpService.verifyOTP(MANAGEMENT_PHONE, String(managementOtp).trim(), false);
                isMgmtValid = true;
            } catch (e2) {}
        }
        if (!isMgmtValid && !mgmtVerified) {
            throw new Error(`Invalid or expired Management OTP for ${MANAGEMENT_PHONE}. Closure not authorized.`);
        }
    }

    const quote = await getRedemptionQuote(scheme.id);

    // Early redemption allowed according to rules and regulations (not strictly blocked)
    const finalValue = quote.finalRedemptionAmount || quote.totalPaid || 0;

    const updated = await prisma.scheme.update({
        where: { id: scheme.id },
        data: {
            status: 'closed',
            redemptionDate: new Date(),
            redemptionValue: finalValue,
            notes: `${scheme.notes || ''} | Closed with Customer & Management (${MANAGEMENT_PHONE}) dual OTP verification on ${new Date().toISOString()}`
        }
    });

    await prisma.schemeActivityLog.create({
        data: {
            schemeId: scheme.id,
            action: 'SCHEME_CLOSED',
            description: `Scheme successfully closed via Customer & Management (${MANAGEMENT_PHONE}) Dual OTP verification. Benefit Tier: ${quote.benefitTier}. Benefit: ${quote.benefitPercentageText}. Value: ₹${finalValue.toLocaleString('en-IN')}`,
            details: {
                quote,
                closureData,
                managementPhone: MANAGEMENT_PHONE
            },
            performedById: performedBy
        }
    });

    // Clear verification cache
    if (cacheHelper) {
        await cacheHelper.del(`scheme_customer_verified_${scheme.id}`).catch(() => {});
        await cacheHelper.del(`scheme_mgmt_verified_${scheme.id}`).catch(() => {});
    }

    return { scheme: updated, quote };
};

const verifyClosureOTP = async (schemeId, otp, performedBy = null) => {
    const scheme = await prisma.scheme.findUnique({
        where: { id: schemeId },
        include: { customer: true }
    });
    if (!scheme) throw new Error('Scheme not found');
    const otpService = require('../../utils/otpService');
    await otpService.verifyOTP(scheme.customer.phone, otp, false);

    if (cacheHelper) {
        await cacheHelper.set(`scheme_customer_verified_${scheme.id}`, true, 1800);
    }

    await prisma.schemeActivityLog.create({
        data: {
            schemeId: scheme.id,
            action: 'CUSTOMER_CLOSURE_OTP_VERIFIED',
            description: `Customer closure OTP verified for phone ${scheme.customer.phone}`,
            details: { phoneEnding: scheme.customer.phone.slice(-4) },
            performedById: performedBy
        }
    }).catch(() => {});

    return { 
        verified: true, 
        message: `Customer OTP verified successfully. Management authorization (${MANAGEMENT_PHONE}) is required next to redeem scheme.` 
    };
};

const requestManagementClosureOTP = async (schemeId, performedBy) => {
    const scheme = await prisma.scheme.findUnique({
        where: { id: schemeId },
        include: { customer: true }
    });
    if (!scheme) throw new Error('Scheme not found');
    if (scheme.status === 'closed' || scheme.status === 'redeemed') {
        throw new Error('Scheme is already closed or redeemed');
    }

    const otpService = require('../../utils/otpService');
    const otpKey = `scheme_mgmt_otp_${scheme.id}`;
    const otp = await otpService.generateAndStoreOTP(otpKey, 300, 'scheme_management_auth', MANAGEMENT_PHONE);

    const isSandbox = process.env.IS_SANDBOX === 'true' || process.env.NODE_ENV !== 'production';

    const result = {
        message: isSandbox
            ? `[SANDBOX] Management Authorization OTP is: ${otp} (or enter 123456)`
            : `Management Authorization OTP sent to management mobile number ${MANAGEMENT_PHONE}`,
        managementPhone: MANAGEMENT_PHONE,
        phoneEnding: MANAGEMENT_PHONE.slice(-4),
        otp: isSandbox ? otp : undefined,
        sandboxOtp: isSandbox ? otp : undefined
    };

    await prisma.schemeActivityLog.create({
        data: {
            schemeId: scheme.id,
            action: 'MANAGEMENT_OTP_REQUESTED',
            description: `Management authorization OTP requested and sent to ${MANAGEMENT_PHONE}`,
            details: { managementPhone: MANAGEMENT_PHONE },
            performedById: performedBy
        }
    }).catch(() => {});

    return result;
};

const verifyManagementClosureOTP = async (schemeId, otp, performedBy = null) => {
    const scheme = await prisma.scheme.findUnique({
        where: { id: schemeId },
        include: { customer: true }
    });
    if (!scheme) throw new Error('Scheme not found');

    const otpService = require('../../utils/otpService');
    const otpKey = `scheme_mgmt_otp_${scheme.id}`;

    let isValid = false;
    try {
        await otpService.verifyOTP(otpKey, String(otp).trim(), false);
        isValid = true;
    } catch (e) {
        try {
            await otpService.verifyOTP(MANAGEMENT_PHONE, String(otp).trim(), false);
            isValid = true;
        } catch (e2) {}
    }

    if (!isValid) {
        throw new Error(`Invalid or expired Management OTP. Please check the code sent to ${MANAGEMENT_PHONE}`);
    }

    if (cacheHelper) {
        await cacheHelper.set(`scheme_mgmt_verified_${scheme.id}`, true, 1800);
    }

    await prisma.schemeActivityLog.create({
        data: {
            schemeId: scheme.id,
            action: 'MANAGEMENT_OTP_VERIFIED',
            description: `Management authorization OTP verified for phone ${MANAGEMENT_PHONE}`,
            details: { managementPhone: MANAGEMENT_PHONE },
            performedById: performedBy
        }
    }).catch(() => {});

    return { 
        verified: true, 
        managementPhone: MANAGEMENT_PHONE,
        message: `Management authorization verified successfully for ${MANAGEMENT_PHONE}. Scheme redemption fully approved.` 
    };
};

/**
 * Rule 22: Background Auto-Closure for schemes > 365 days
 * Automatically closes scheme without benefits and generates refund notes for bank transfer.
 */
const processExpiredSchemes = async (shopId) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 365);

    const expiredSchemes = await prisma.scheme.findMany({
        where: {
            ...(shopId ? { shopId } : {}),
            status: { in: ['active', 'matured'] },
            createdAt: { lte: cutoffDate }
        },
        include: { customer: true }
    });

    const results = [];
    for (const scheme of expiredSchemes) {
        let metadata = {};
        try {
            if (scheme.notes && scheme.notes.trim().startsWith('{')) {
                metadata = JSON.parse(scheme.notes);
            }
        } catch (e) {}

        const updated = await prisma.scheme.update({
            where: { id: scheme.id },
            data: {
                status: 'closed',
                redemptionDate: new Date(),
                redemptionValue: scheme.totalPaid,
                notes: `${scheme.notes || ''} | AUTO-CLOSED after 365 days (Rule 22). Zero scheme benefits. Principal ₹${Number(scheme.totalPaid).toLocaleString('en-IN')} refundable to registered bank: ${metadata.bankAccount || 'Direct Bank NEFT/RTGS'}.`
            }
        });

        await prisma.schemeActivityLog.create({
            data: {
                schemeId: scheme.id,
                action: 'AUTO_CLOSURE_EXPIRED',
                description: `Scheme automatically closed on 365th day without scheme benefits as per Rule 22. Principal ₹${Number(scheme.totalPaid).toLocaleString('en-IN')} pending refund.`,
                details: {
                    totalPaid: Number(scheme.totalPaid),
                    accumulatedGrams: Number(scheme.accumulatedGrams),
                    bankAccount: metadata.bankAccount,
                    ifscCode: metadata.ifscCode
                }
            }
        });
        results.push(updated);
    }
    return results;
};

/**
 * Create Razorpay payment order for online Scheme installment
 */
const createSchemePaymentOrder = async (schemeId, amount, userId) => {
    const scheme = await prisma.scheme.findUnique({
        where: { id: schemeId }
    });
    if (!scheme) throw ApiError.notFound('Scheme not found');
    if (scheme.status !== 'active') throw ApiError.badRequest(`Cannot pay installment for scheme in ${scheme.status} status`);
    if (scheme.customerId !== userId) throw ApiError.forbidden('Unauthorized: You can only deposit installments for your own savings scheme.');

    const installmentAmt = Number(amount);
    const monthlyInstallment = Number(scheme.monthlyInstallment);
    const totalMonths = scheme.totalMonths || 11;
    const maxTotalPayable = monthlyInstallment * totalMonths;
    const currentPaid = Number(scheme.totalPaid || 0);

    if (isNaN(installmentAmt) || installmentAmt <= 0) {
        throw ApiError.badRequest('A valid positive installment amount is required.');
    }
    if (installmentAmt < monthlyInstallment || (Math.round(installmentAmt * 100) % Math.round(monthlyInstallment * 100) !== 0)) {
        throw ApiError.badRequest(`Installment amount must be an exact multiple of the monthly installment (₹${monthlyInstallment.toLocaleString('en-IN')}).`);
    }
    const maxAllowedInSingleTx = monthlyInstallment * 5;
    if (installmentAmt > maxAllowedInSingleTx) {
        throw ApiError.badRequest(`A maximum of 5 installments (₹${maxAllowedInSingleTx.toLocaleString('en-IN')}) can be paid in a single transaction.`);
    }
    if (currentPaid + installmentAmt > maxTotalPayable) {
        const remainingPayable = maxTotalPayable - currentPaid;
        throw ApiError.badRequest(`Payment of ₹${installmentAmt.toLocaleString('en-IN')} exceeds the remaining balance for this scheme. Max remaining payable: ₹${remainingPayable.toLocaleString('en-IN')}.`);
    }

    // Razorpay receipt max length is 40 chars
    const receipt = `sch_${scheme.schemeId}_${Date.now()}`.slice(0, 40);

    const razorpayOrder = await createRazorpayOrder(
        installmentAmt,
        'INR',
        receipt,
        {
            schemeId: scheme.id,
            schemeCode: scheme.schemeId,
            userId: userId.toString(),
            amount: installmentAmt.toString()
        }
    );

    return {
        schemeId: scheme.id,
        schemeCode: scheme.schemeId,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID
    };
};

/**
 * Verify Razorpay payment signature and record scheme installment
 */
const verifySchemePayment = async (schemeId, paymentData, userId) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        throw ApiError.badRequest('Missing Razorpay payment parameters');
    }

    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(text)
        .digest('hex');

    if (expectedSignature !== razorpay_signature) {
        throw ApiError.badRequest('Invalid payment signature');
    }

    // Verify payment status with Razorpay
    const payment = await fetchPayment(razorpay_payment_id);
    if (!payment || payment.status !== 'captured') {
        throw ApiError.badRequest('Payment not captured by payment gateway');
    }

    const amountInRupees = Number(payment.amount) / 100;

    // Prevent duplicate installment for identical transaction ID
    const existingInstallment = await prisma.schemeInstallment.findFirst({
        where: { transactionId: razorpay_payment_id }
    });
    if (existingInstallment) {
        return await getSchemeById(schemeId);
    }

    const recordPayload = {
        amount: amountInRupees,
        method: 'razorpay',
        transactionId: razorpay_payment_id,
        notes: `Razorpay Online Payment (Order: ${razorpay_order_id})`
    };

    return await recordInstallment(schemeId, recordPayload, userId, 'customer');
};

module.exports = {
    parseSchemeDetails,
    enrollCustomer,
    recordInstallment,
    createSchemePaymentOrder,
    verifySchemePayment,
    getStoreSchemes,
    calculateRedemptionValue,
    getUserSchemeStatements,
    getSchemeById,
    updateScheme,
    deleteScheme,
    getSchemeTerms,
    getRedemptionQuote,
    requestClosureOTP,
    closeSchemeWithOTP,
    verifyClosureOTP,
    requestManagementClosureOTP,
    verifyManagementClosureOTP,
    processExpiredSchemes
};
