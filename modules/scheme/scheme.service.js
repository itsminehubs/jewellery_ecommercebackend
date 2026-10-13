const prisma = require('../../config/prisma');
const { validateAndCheckDuplicateUtr } = require('../../utils/utrValidator');

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

    const kycType = (metadata.panNumber || scheme.customer?.panNumber) && metadata.aadhaarNumber 
        ? 'PAN & AADHAAR' 
        : ((metadata.panNumber || scheme.customer?.panNumber) ? 'PAN' : (metadata.aadhaarNumber ? 'AADHAAR' : 'KYC_VERIFIED'));

    return {
        ...scheme,
        minMonthlyInstallment,
        applicablePurities,
        applicablePuritiesText: Array.isArray(applicablePurities) ? applicablePurities.join(', ') : String(applicablePurities),
        kycType,
        hasBankDetails: Boolean(metadata.bankAccount),
        metadata
    };
};

const enrollCustomer = async (data) => {
    // --- Load store-level scheme settings (configured by admin/superadmin) ---
    let storeSchemeSettings = {};
    try {
        const store = await prisma.store.findUnique({ where: { shop_id: data.shop_id } });
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

    // Auto-generate Scheme ID
    const dateStr = new Date().toISOString().slice(0, 7).replace(/-/g, ''); // YYYYMM
    const count = await prisma.scheme.count({
        where: {
            shopId: data.shop_id,
            createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
        }
    }) + 1;
    
    const schemeId = `SCH-${data.shop_id}-${dateStr}-${count.toString().padStart(4, '0')}`;

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
            shopId: data.shop_id,
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

const recordInstallment = async (schemeId, paymentData, performedBy) => {
    return await prisma.$transaction(async (tx) => {
        const scheme = await tx.scheme.findUnique({
            where: { id: schemeId },
            include: { installments: true }
        });

        if (!scheme) throw new Error('Scheme not found');
        if (scheme.status !== 'active') throw new Error(`Cannot pay installment for scheme in ${scheme.status} status`);
        if (scheme.installments.length >= scheme.totalMonths) throw new Error('All installments already paid for this scheme tenure.');

        const amount = Number(paymentData.amount);
        const monthlyInstallment = Number(scheme.monthlyInstallment);

        // Rule 4: Maximum 5 installments can be paid in a single transaction
        const maxAllowedInSingleTx = monthlyInstallment * 5;
        if (amount > maxAllowedInSingleTx) {
            throw new Error(`A maximum of 5 installments (₹${maxAllowedInSingleTx.toLocaleString('en-IN')}) can be paid in a single transaction.`);
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

        // Rule 2: Monthly installments must be paid between the 1st and 10th of every month
        // (Unless explicitly overridden by admin with grace approval notes)
        const currentDay = new Date().getDate();
        const isWithinWindow = currentDay >= 1 && currentDay <= 10;
        if (!isWithinWindow && !paymentData.allowGracePeriod && !paymentData.overrideWindow) {
            throw new Error(`Monthly installments must be paid between the 1st and 10th of the month (Today is day ${currentDay}). Admin override is required to accept late installments.`);
        }

        let goldRateApplied = null;
        let gramsCredited = null;

        // Rule 6 & 8: Frozen gold rate at time of each installment payment for 22K/18K/14K
        if (scheme.schemeType === 'GOLD' && scheme.purity) {
            const normPurity = String(scheme.purity).trim().toUpperCase();
            let rateRecord = await tx.schemeGoldRate.findFirst({
                where: {
                    metal: { equals: 'gold', mode: 'insensitive' },
                    purity: { equals: normPurity, mode: 'insensitive' }
                },
                orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }]
            });
            if (!rateRecord) {
                // Seamless fallback to store standard gold rate if scheme gold rate not yet set separately
                rateRecord = await tx.goldRate.findFirst({
                    where: {
                        metal: { equals: 'gold', mode: 'insensitive' },
                        purity: { equals: normPurity, mode: 'insensitive' }
                    },
                    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }]
                });
            }
            if (!rateRecord) throw new Error(`Gold Rate not set for ${scheme.purity}. Please configure current gold rate first.`);
            
            goldRateApplied = Number(Number(rateRecord.ratePerGram).toFixed(2));
            gramsCredited = Number((amount / goldRateApplied).toFixed(3));
        }

        const newInstallment = await tx.schemeInstallment.create({
            data: {
                schemeId: scheme.id,
                amount,
                goldRateApplied,
                gramsCredited,
                method: paymentData.method,
                transactionId: paymentData.transactionId,
                notes: paymentData.notes || (isWithinWindow ? 'Paid on schedule (1-10 window)' : 'Late installment accepted under grace period'),
                collectedById: performedBy
            }
        });

        const newTotalPaid = Number(scheme.totalPaid) + amount;
        const newInstallmentCount = scheme.installments.length + 1;
        
        let newStatus = scheme.status;
        if (newInstallmentCount >= scheme.totalMonths) {
            newStatus = 'matured';
        }

        const newAccumulatedGrams = scheme.schemeType === 'GOLD' 
            ? Number(scheme.accumulatedGrams) + (gramsCredited || 0)
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
                description: `Paid ₹${amount.toLocaleString('en-IN')} for installment ${newInstallmentCount}/${scheme.totalMonths} via ${paymentData.method.toUpperCase()}. Rate frozen at ₹${goldRateApplied || 'N/A'}/g.`,
                details: {
                    amount,
                    method: paymentData.method,
                    transactionId: paymentData.transactionId,
                    goldRateApplied,
                    gramsCredited,
                    newAccumulatedGrams,
                    paymentWindowDay: currentDay,
                    isLateWithGrace: !isWithinWindow
                },
                performedById: performedBy
            }
        });

        // Update Cashbook for the store
        if (['cash', 'upi', 'card', 'bank_transfer', 'neft_rtgs', 'neft', 'rtgs'].includes(paymentData.method)) {
            const cashbookService = require('../accounting/cashbook.service');
            if (cashbookService.updateCashbookOnEventPrisma) {
                await cashbookService.updateCashbookOnEventPrisma(
                    scheme.shopId, 
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
    const where = { shopId, ...filter };

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
const calculateRedemptionValue = (schemeRaw) => {
    const scheme = parseSchemeDetails(schemeRaw);
    if (!scheme) return { error: 'Scheme not found' };

    if (scheme.status === 'redeemed' || scheme.status === 'closed') {
        return { 
            isEligible: false,
            error: 'Scheme already redeemed or closed',
            status: scheme.status
        };
    }

    const paidInstallmentCount = scheme.installments ? scheme.installments.length : 0;
    const totalMonths = scheme.totalMonths || 11;
    const halfTenureThreshold = totalMonths === 11 ? 6 : Math.ceil(totalMonths / 2);

    // Calculate days elapsed since enrollment
    const enrollmentDate = new Date(scheme.startDate || scheme.createdAt);
    const today = new Date();
    const daysSinceEnrollment = Math.floor((today - enrollmentDate) / (1000 * 60 * 60 * 24));

    // Rule 22: Auto-closure penalty if > 365 days
    const isPast365Days = daysSinceEnrollment > 365;

    // Benefit ratio determination
    let benefitRatio = 0; // 0, 0.5, or 1.0
    let benefitTier = 'NO_BENEFIT';

    if (isPast365Days) {
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

    const canPurchaseNow = daysSinceEnrollment >= 330;
    const isOptimalClosureWindow = daysSinceEnrollment >= 330 && daysSinceEnrollment <= 345;
    const isExtendedGraceWindow = daysSinceEnrollment > 345 && daysSinceEnrollment <= 365;

    const totalPaid = Number(scheme.totalPaid || 0);
    const accumulatedGrams = Number(scheme.accumulatedGrams || 0);

    // Dynamic minimum installment & applicable purities from admin configuration
    const minMonthlyInstallment = scheme.minMonthlyInstallment || Number(scheme.monthlyInstallment);
    const applicablePurities = scheme.applicablePurities || (scheme.purity ? [scheme.purity] : ['22K', '18K', '14K']);

    if (scheme.schemeType === 'GOLD') {
        const fullMakingChargeDiscount = 20; // 20% standard discount on making charges
        const makingChargeDiscount = fullMakingChargeDiscount * benefitRatio;

        const standardBonusGramPercentage = Number(scheme.bonusPercentage || 0) > 0 ? 5 : 0;
        const bonusWeightGrams = Number(((accumulatedGrams * (standardBonusGramPercentage / 100)) * benefitRatio).toFixed(3));
        const totalEligibleGrams = Number((accumulatedGrams + bonusWeightGrams).toFixed(3));

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
            paidMonths: paidInstallmentCount,
            totalMonths,
            benefitTier,
            benefitRatio,
            benefitPercentageText: `${benefitRatio * 100}%`,
            totalPaid,
            accumulatedGrams,
            bonusWeightGrams,
            totalEligibleGrams,
            makingChargeDiscount,
            diamondDiscount: 0,
            eligiblePurities: applicablePurities,
            ineligibleItems: ['24K Gold Coins', '24K Gold Bars'],
            razorpaySupported: true,
            notes: daysSinceEnrollment < 330 
                ? `Jewellery purchase unlocks after 330 days (Days remaining: ${330 - daysSinceEnrollment}). Current eligible benefit: ${benefitRatio * 100}%.`
                : (isPast365Days 
                    ? '365 days exceeded. Scheme expired without benefits. Principal refundable.'
                    : `Eligible for redemption with ${benefitRatio * 100}% scheme benefit.`)
        };
    }

    if (scheme.schemeType === 'DIAMOND') {
        const fullBonus = (Number(scheme.monthlyInstallment) * Number(scheme.bonusPercentage || 100)) / 100;
        const eligibleBonus = fullBonus * benefitRatio;

        const fullMakingChargeDiscount = 40;
        const fullDiamondDiscount = 40;

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
            paidMonths: paidInstallmentCount,
            totalMonths,
            benefitTier,
            benefitRatio,
            benefitPercentageText: `${benefitRatio * 100}%`,
            totalPaid,
            eligibleBonus,
            finalRedemptionAmount: totalPaid + eligibleBonus,
            makingChargeDiscount: fullMakingChargeDiscount * benefitRatio,
            diamondDiscount: fullDiamondDiscount * benefitRatio,
            razorpaySupported: true,
            notes: daysSinceEnrollment < 330 
                ? `Redemption unlocks after 330 days (Days remaining: ${330 - daysSinceEnrollment}). Current eligible benefit: ${benefitRatio * 100}%.`
                : (isPast365Days 
                    ? '365 days exceeded. Scheme expired without benefits. Principal refundable.'
                    : `Eligible for redemption with ${benefitRatio * 100}% scheme benefit.`)
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
    return calculateRedemptionValue(scheme);
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

    const result = {
        message: `Closure OTP sent to registered mobile number ending with ${scheme.customer.phone.slice(-4)}`,
        phoneEnding: scheme.customer.phone.slice(-4)
    };

    if (process.env.IS_SANDBOX === 'true' || process.env.NODE_ENV !== 'production') {
        result.otp = otp;
    }

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

const closeSchemeWithOTP = async (schemeId, otp, closureData, performedBy) => {
    const scheme = await prisma.scheme.findUnique({
        where: { id: schemeId },
        include: { customer: true, installments: true }
    });
    if (!scheme) throw new Error('Scheme not found');
    if (scheme.status === 'closed' || scheme.status === 'redeemed') {
        throw new Error('Scheme is already closed or redeemed');
    }

    // Verify OTP (Rule 26)
    const otpService = require('../../utils/otpService');
    await otpService.verifyOTP(scheme.customer.phone, otp);

    const quote = calculateRedemptionValue(scheme);

    const updated = await prisma.scheme.update({
        where: { id: scheme.id },
        data: {
            status: 'closed',
            redemptionDate: new Date(),
            redemptionValue: quote.finalRedemptionAmount || quote.totalPaid || 0,
            notes: `${scheme.notes || ''} | Closed with OTP verification on ${new Date().toISOString()}`
        }
    });

    await prisma.schemeActivityLog.create({
        data: {
            schemeId: scheme.id,
            action: 'SCHEME_CLOSED',
            description: `Scheme successfully closed via OTP verification. Benefit Tier: ${quote.benefitTier}. Benefit: ${quote.benefitPercentageText}.`,
            details: {
                quote,
                closureData
            },
            performedById: performedBy
        }
    });

    return { scheme: updated, quote };
};

module.exports = {
    enrollCustomer,
    recordInstallment,
    getStoreSchemes,
    calculateRedemptionValue,
    getUserSchemeStatements,
    getSchemeById,
    updateScheme,
    deleteScheme,
    getSchemeTerms,
    getRedemptionQuote,
    requestClosureOTP,
    closeSchemeWithOTP
};
