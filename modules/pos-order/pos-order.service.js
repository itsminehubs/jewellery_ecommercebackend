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

const { parseKarat, toPureGoldGrams, convertGoldQuantity } = require('../../utils/purityHelper');

const MAX_RETRIES = 3;

const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
const roundTo3 = (num) => Math.round((num + Number.EPSILON) * 1000) / 1000;
const roundTo4 = (num) => Math.round((num + Number.EPSILON) * 10000) / 10000;

/**
 * Calculate the exact price of a POS cart based on live rates and dynamic credit memo rate locking
 */
const calculateCartPrice = async (items, storeId, lockedGoldRate = null, creditMemoRef = null, schemeRef = null) => {
    let cartGrossSubtotal = 0;
    let cartSubtotal = 0;
    let cartGst = 0;
    let cartTotal = 0;
    const calculatedItems = [];

    // 1. Resolve active Credit Memos (supports single ID, array of IDs, or comma-separated string)
    let memoLookupIds = [];
    if (Array.isArray(creditMemoRef)) {
        memoLookupIds = creditMemoRef.map(id => String(id).trim()).filter(Boolean);
    } else if (typeof creditMemoRef === 'string' && creditMemoRef.trim()) {
        memoLookupIds = creditMemoRef.split(',').map(id => id.trim()).filter(Boolean);
    } else if (typeof lockedGoldRate === 'string' && isNaN(Number(lockedGoldRate)) && lockedGoldRate.trim()) {
        memoLookupIds = [lockedGoldRate.trim()];
    }

    let activeMemos = [];
    if (memoLookupIds.length > 0) {
        const foundMemos = await prisma.creditMemo.findMany({
            where: {
                OR: [
                    { memoId: { in: memoLookupIds } },
                    { id: { in: memoLookupIds } }
                ],
                status: { not: 'cancelled' }
            }
        });

        for (const lookupId of memoLookupIds) {
            const m = foundMemos.find(fm => fm.memoId === lookupId || fm.id === lookupId);
            if (m && !activeMemos.some(am => am.id === m.id)) {
                const refPurity = m.referencePurity || m.exchangePurity || '22K';
                const rate = Number(m.lockedGoldRate || 0);
                let grams = 0;
                if (m.remainingGrams !== null && m.remainingGrams !== undefined) {
                    grams = Number(m.remainingGrams);
                } else if (m.lockedGrams !== null && m.lockedGrams !== undefined) {
                    grams = Number(m.lockedGrams);
                } else if (rate > 0) {
                    grams = Number((Number(m.balance) / rate).toFixed(4));
                }

                if (grams > 0 && rate > 0) {
                    activeMemos.push({
                        id: m.id,
                        memoId: m.memoId,
                        referencePurity: refPurity,
                        refKarat: parseKarat(refPurity),
                        lockedRate: rate,
                        initialGrams: roundTo4(grams),
                        availableGrams: roundTo4(grams),
                        consumedGrams: 0,
                        consumedValue: 0
                    });
                }
            }
        }
    }

    // Fallback for manual legacy rate override without memo
    if (activeMemos.length === 0 && lockedGoldRate && !isNaN(Number(lockedGoldRate)) && Number(lockedGoldRate) > 0) {
        activeMemos.push({
            id: 'legacy-override',
            memoId: 'Rate Override',
            referencePurity: '22K',
            refKarat: 22,
            lockedRate: Number(lockedGoldRate),
            initialGrams: 999999,
            availableGrams: 999999,
            consumedGrams: 0,
            consumedValue: 0
        });
    }

    // 2. Resolve active Schemes (supports single ID, array of IDs, or comma-separated string)
    let schemeLookupIds = [];
    if (Array.isArray(schemeRef)) {
        schemeLookupIds = schemeRef.map(id => String(id).trim()).filter(Boolean);
    } else if (typeof schemeRef === 'string' && schemeRef.trim()) {
        schemeLookupIds = schemeRef.split(',').map(id => id.trim()).filter(Boolean);
    }

    let activeSchemes = [];
    if (schemeLookupIds.length > 0) {
        const foundSchemes = await prisma.scheme.findMany({
            where: {
                OR: [
                    { schemeId: { in: schemeLookupIds } },
                    { id: { in: schemeLookupIds } }
                ],
                status: { notIn: ['closed', 'cancelled'] }
            }
        });

        for (const s of foundSchemes) {
            const monthlyInst = Number(s.monthlyInstallment || 1);
            const totalPaid = Number(s.totalPaid || 0);
            const totalMonths = Number(s.totalMonths || 11);
            const paidInstallmentCount = Math.min(totalMonths, Math.floor(totalPaid / (monthlyInst > 0 ? monthlyInst : 1)));

            const enrollmentDate = new Date(s.startDate || s.createdAt);
            const daysSinceEnrollment = Math.floor((new Date() - enrollmentDate) / (1000 * 60 * 60 * 24));
            const isFullTenure = s.status === 'matured' || s.status === 'completed' || (paidInstallmentCount >= totalMonths) || (daysSinceEnrollment >= 330 && daysSinceEnrollment <= 365);
            const isHalfTenure = !isFullTenure && ((paidInstallmentCount >= Math.ceil(totalMonths / 2)) || (daysSinceEnrollment >= 180 && daysSinceEnrollment < 330));

            let metadata = {};
            try {
                if (s.notes && s.notes.trim().startsWith('{')) {
                    metadata = JSON.parse(s.notes);
                }
            } catch (e) {}

            let makingDiscountPercent = 0;
            let diamondDiscountPercent = 0;
            let diamondMakingDiscountPercent = 0;

            if (s.schemeType === 'GOLD') {
                if (isFullTenure) makingDiscountPercent = Number(metadata.goldMakingDiscountFull || metadata.goldMakingDiscountUpToFull || 100);
                else if (isHalfTenure) makingDiscountPercent = Number(metadata.goldMakingDiscountUpToHalf || 50);
                else makingDiscountPercent = 0;
            } else if (s.schemeType === 'DIAMOND') {
                if (isFullTenure) {
                    diamondDiscountPercent = Number(metadata.diamondFlatDiscountFull || 40);
                    diamondMakingDiscountPercent = Number(metadata.diamondMakingFlatDiscountFull || metadata.diamondMakingDiscountFull || 40);
                } else if (isHalfTenure) {
                    diamondDiscountPercent = Number(metadata.diamondFlatDiscountHalf || 20);
                    diamondMakingDiscountPercent = Number(metadata.diamondMakingFlatDiscountHalf || metadata.diamondMakingDiscountHalf || 20);
                }
            }

            const totalAccum = Number(s.accumulatedGrams || 0);
            const alreadyRedeemed = Number(s.redeemedGrams || 0);
            const availableGrams = s.remainingGrams != null ? Number(s.remainingGrams) : Math.max(0, totalAccum - alreadyRedeemed);

            activeSchemes.push({
                id: s.id,
                schemeId: s.schemeId,
                schemeType: s.schemeType,
                purity: s.purity || '22K',
                refKarat: parseKarat(s.purity || '22K'),
                initialGrams: roundTo4(availableGrams),
                availableGrams: roundTo4(availableGrams),
                consumedGrams: 0,
                consumedValue: 0,
                daysSinceEnrollment,
                makingDiscountPercent,
                diamondDiscountPercent,
                diamondMakingDiscountPercent
            });
        }
    }

    let totalLockedGoldValue = 0;
    let totalCustomerSavings = 0;

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
        const grossWeight = metalDetails?.grossWeight ? Number(metalDetails.grossWeight) : (productData.grossWeight ? Number(productData.grossWeight) : 0);
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
        let stoneValue = roundTo2(dynamicStoneValue > 0 ? dynamicStoneValue : manualStoneCharges);

        const activeDiamondScheme = activeSchemes.find(s => s.schemeType === 'DIAMOND' && s.diamondDiscountPercent > 0);
        let diamondDiscountAmount = 0;
        if (activeDiamondScheme && stoneValue > 0) {
            diamondDiscountAmount = roundTo2(stoneValue * (activeDiamondScheme.diamondDiscountPercent / 100));
            stoneValue = Math.max(0, roundTo2(stoneValue - diamondDiscountAmount));
        }

        // 2. Net Gold Weight and Wastage
        const netWeight = roundTo3(Math.max(0, grossWeight - totalStoneWeight));
        const wastagePercent = productData.wastage ? Number(productData.wastage) : 0;
        const wastageWeight = roundTo3(netWeight * (wastagePercent / 100));
        const finalGoldWeight = roundTo3(netWeight + wastageWeight);

        const qty = Number(item.quantity) || 1;
        const totalItemGoldWeight = roundTo3(finalGoldWeight * qty);

        const metalType = (metalDetails?.metalType || 'gold').toLowerCase();
        const productPurity = metalDetails?.purity || '22K';
        const prodKarat = parseKarat(productPurity);

        // 3. Fetch latest live approved rate for this product's purity
        let currentPurityRate = 0;
        const currentRateDoc = await prisma.goldRate.findFirst({
            where: {
                metal: metalType,
                purity: {
                    equals: productPurity,
                    mode: 'insensitive'
                }
            },
            orderBy: [
                { effectiveDate: 'desc' },
                { createdAt: 'desc' }
            ]
        });

        if (currentRateDoc) {
            currentPurityRate = Number(currentRateDoc.ratePerGram);
        } else {
            // Fallback: derive from 22K base rate
            const base22k = await prisma.goldRate.findFirst({
                where: { metal: 'gold', purity: { equals: '22K', mode: 'insensitive' } },
                orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }]
            });
            if (base22k) {
                currentPurityRate = Number(((Number(base22k.ratePerGram) * prodKarat) / 22).toFixed(2));
            }
        }

        // 4. Dynamic Gold Rate Locking and Purity Conversion
        let metalValue = 0;
        let rateUsed = currentPurityRate;
        let appliedProductGrams = 0;
        let remainingProductGrams = totalItemGoldWeight;
        let lockedPortionValue = 0;
        let remainingPortionValue = 0;
        let itemSavings = 0;
        const itemConsumedBreakdown = [];

        if (metalType === 'gold' && activeMemos.some(m => m.availableGrams > 0)) {
            let itemWeightNeeded = totalItemGoldWeight;

            for (const memo of activeMemos) {
                if (memo.availableGrams <= 0 || itemWeightNeeded <= 0) continue;

                // Universal Purity Conversion for this memo:
                // coverable_product_grams = memo.availableGrams * (memo.refKarat / prodKarat)
                const coverableProductGrams = (memo.availableGrams * memo.refKarat) / prodKarat;
                const applyGrams = roundTo3(Math.min(coverableProductGrams, itemWeightNeeded));
                if (applyGrams <= 0) continue;

                // consumed_reference_grams = applyGrams * (prodKarat / memo.refKarat)
                const refGramsConsumed = roundTo4((applyGrams * prodKarat) / memo.refKarat);
                memo.availableGrams = Math.max(0, roundTo4(memo.availableGrams - refGramsConsumed));
                memo.consumedGrams = roundTo4(memo.consumedGrams + refGramsConsumed);

                const memoPortionValue = roundTo2(refGramsConsumed * memo.lockedRate);
                memo.consumedValue = roundTo2(memo.consumedValue + memoPortionValue);

                lockedPortionValue = roundTo2(lockedPortionValue + memoPortionValue);
                appliedProductGrams = roundTo3(appliedProductGrams + applyGrams);
                itemWeightNeeded = roundTo3(Math.max(0, itemWeightNeeded - applyGrams));

                itemConsumedBreakdown.push({
                    memoId: memo.memoId,
                    referencePurity: memo.referencePurity,
                    lockedRate: memo.lockedRate,
                    appliedProductGrams: applyGrams,
                    consumedRefGrams: refGramsConsumed,
                    portionValue: memoPortionValue
                });
            }

            remainingProductGrams = itemWeightNeeded;
            remainingPortionValue = roundTo2(remainingProductGrams * currentPurityRate);
            metalValue = roundTo2(lockedPortionValue + remainingPortionValue);

            // Savings calculation against pricing 100% at today's market rate
            const fullValueAtTodayRate = roundTo2(totalItemGoldWeight * currentPurityRate);
            itemSavings = Math.max(0, roundTo2(fullValueAtTodayRate - metalValue));
            totalCustomerSavings = roundTo2(totalCustomerSavings + itemSavings);
            totalLockedGoldValue = roundTo2(totalLockedGoldValue + lockedPortionValue);

            rateUsed = appliedProductGrams > 0 ? (itemConsumedBreakdown[0]?.lockedRate || currentPurityRate) : currentPurityRate;
        } else {
            metalValue = roundTo2(totalItemGoldWeight * currentPurityRate);
            remainingPortionValue = metalValue;
            rateUsed = currentPurityRate;
        }

        // Apply Gold Scheme: Deduct saved gold weight directly, charge rest gold at today's rate
        let schemeGoldDeductedGrams = 0;
        let schemeItemBreakdown = [];

        if (metalType === 'gold' && activeSchemes.some(s => s.schemeType === 'GOLD' && s.availableGrams > 0)) {
            let itemWeightNeeded = remainingProductGrams;

            for (const sch of activeSchemes.filter(s => s.schemeType === 'GOLD')) {
                if (sch.availableGrams <= 0 || itemWeightNeeded <= 0) continue;

                const coverableProductGrams = (sch.availableGrams * sch.refKarat) / prodKarat;
                const applyGrams = roundTo3(Math.min(coverableProductGrams, itemWeightNeeded));
                if (applyGrams <= 0) continue;

                const refGramsConsumed = roundTo4((applyGrams * prodKarat) / sch.refKarat);
                sch.availableGrams = Math.max(0, roundTo4(sch.availableGrams - refGramsConsumed));
                sch.consumedGrams = roundTo4(sch.consumedGrams + refGramsConsumed);

                schemeGoldDeductedGrams = roundTo3(schemeGoldDeductedGrams + applyGrams);
                itemWeightNeeded = roundTo3(Math.max(0, itemWeightNeeded - applyGrams));

                const savedGoldValue = roundTo2(applyGrams * currentPurityRate);
                sch.consumedValue = roundTo2((sch.consumedValue || 0) + savedGoldValue);

                schemeItemBreakdown.push({
                    schemeId: sch.schemeId,
                    schemeType: 'GOLD',
                    purity: sch.purity,
                    appliedProductGrams: applyGrams,
                    consumedRefGrams: refGramsConsumed,
                    savedGoldValue,
                    makingDiscountPercent: sch.makingDiscountPercent
                });
            }

            remainingProductGrams = itemWeightNeeded; // Rest Gold
            remainingPortionValue = roundTo2(remainingProductGrams * currentPurityRate); // Rest Gold @ Today Rate
            metalValue = roundTo2(lockedPortionValue + remainingPortionValue);

            const savedGoldSavings = roundTo2(schemeGoldDeductedGrams * currentPurityRate);
            itemSavings = Math.max(0, roundTo2(itemSavings + savedGoldSavings));
            totalCustomerSavings = roundTo2(totalCustomerSavings + savedGoldSavings);
        }

        // 5. Calculate Making Charges & Apply Discount
        // CRITICAL USER RULE: Making charge is calculated on GROSS WEIGHT ONLY when a scheme is applied!
        const isSchemeActive = activeSchemes.length > 0 || schemeItemBreakdown.length > 0;
        const weightForMaking = isSchemeActive ? (grossWeight > 0 ? grossWeight : netWeight) : netWeight;

        let makingValue = 0;
        let makingCharges = productData.makingCharges ? Number(productData.makingCharges) : (productData.makingCharge ? Number(productData.makingCharge) : 0);
        const makingPercentage = productData.makingPercentage ? Number(productData.makingPercentage) : 0;

        if (makingPercentage > 0 && rateUsed > 0) {
            if (productData.makingChargeType === 'per_gram') {
                makingCharges = roundTo2((makingPercentage / 100) * rateUsed);
                makingValue = roundTo2(makingCharges * weightForMaking);
            } else {
                makingValue = roundTo2(metalValue * (makingPercentage / 100));
                makingCharges = makingValue;
            }
        } else if (productData.makingChargeType === 'per_gram') {
            makingValue = roundTo2(makingCharges * weightForMaking);
        } else {
            makingValue = roundTo2(makingCharges);
        }

        let schemeMakingDiscountPercent = 0;
        if (schemeItemBreakdown.length > 0) {
            schemeMakingDiscountPercent = schemeItemBreakdown[0].makingDiscountPercent || 0;
        } else if (activeSchemes.some(s => s.schemeType === 'DIAMOND' && s.diamondMakingDiscountPercent > 0)) {
            schemeMakingDiscountPercent = activeSchemes.find(s => s.schemeType === 'DIAMOND')?.diamondMakingDiscountPercent || 0;
        }

        let schemeMakingDiscountAmount = 0;
        if (schemeMakingDiscountPercent > 0) {
            schemeMakingDiscountAmount = roundTo2(makingValue * (schemeMakingDiscountPercent / 100));
        }

        const discountAmount = Number(item.discount || 0) + schemeMakingDiscountAmount;
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

        const itemGross = roundTo2((metalValue + makingValue + stoneValue) * qty);
        cartGrossSubtotal = roundTo2(cartGrossSubtotal + itemGross);
        cartSubtotal = roundTo2(cartSubtotal + subtotal);
        cartGst = roundTo2(cartGst + gst);
        cartTotal = roundTo2(cartTotal + finalTotal);

        calculatedItems.push({
            ...productData,
            calculatedPrice: {
                metalValue,
                makingCharge: makingValue,
                originalMakingCharge: makingValue,
                unitMakingCharge: makingCharges,
                discountedMakingValue: discountedMakingValue,
                stoneValue,
                discountAmount,
                subtotal,
                gst,
                finalTotal,
                rateUsed,
                currentPurityRate,
                rateLock: {
                    referencePurity: itemConsumedBreakdown[0]?.referencePurity || activeMemos[0]?.referencePurity || '22K',
                    productPurity: productPurity,
                    appliedProductGrams,
                    remainingProductGrams,
                    consumedRefGrams: roundTo4(itemConsumedBreakdown.reduce((s, b) => s + b.consumedRefGrams, 0)),
                    lockedPortionValue,
                    remainingPortionValue,
                    savings: itemSavings,
                    lockedRate: itemConsumedBreakdown[0]?.lockedRate || activeMemos[0]?.lockedRate || 0,
                    breakdown: itemConsumedBreakdown
                },
                schemeLock: schemeItemBreakdown.length > 0 ? {
                    schemeId: schemeItemBreakdown[0].schemeId,
                    schemeType: 'GOLD',
                    purity: schemeItemBreakdown[0].purity,
                    initialGoldWeight: totalItemGoldWeight,
                    savedGoldDeducted: schemeGoldDeductedGrams,
                    restGoldWeight: remainingProductGrams,
                    todayRate: currentPurityRate,
                    restGoldValue: remainingPortionValue,
                    makingDiscountPercent: schemeMakingDiscountPercent,
                    savings: roundTo2(schemeGoldDeductedGrams * currentPurityRate)
                } : null
            },
            quantity: qty
        });
    }

    return {
        items: calculatedItems,
        summary: {
            grossSubtotal: roundTo2(cartGrossSubtotal),
            subtotal: roundTo2(cartSubtotal),
            gst: roundTo2(cartGst),
            total: roundTo2(cartSubtotal + cartGst),
            goldLock: activeMemos.length > 0 && activeMemos.some(m => m.consumedGrams > 0 || m.initialGrams > 0) ? {
                memoId: activeMemos.map(m => m.memoId).join(', '),
                referencePurity: activeMemos[0]?.referencePurity || '22K',
                lockedRate: activeMemos[0]?.lockedRate || 0,
                initialAvailableGrams: roundTo3(activeMemos.reduce((s, m) => s + m.initialGrams, 0)),
                consumedRefGrams: roundTo3(activeMemos.reduce((s, m) => s + m.consumedGrams, 0)),
                remainingRefGrams: roundTo3(activeMemos.reduce((s, m) => s + m.availableGrams, 0)),
                totalLockedGoldValue: roundTo2(totalLockedGoldValue),
                totalCustomerSavings: roundTo2(totalCustomerSavings),
                memos: activeMemos.map(m => ({
                    memoId: m.memoId,
                    referencePurity: m.referencePurity,
                    lockedRate: m.lockedRate,
                    initialAvailableGrams: roundTo3(m.initialGrams),
                    consumedRefGrams: roundTo3(m.consumedGrams),
                    remainingRefGrams: roundTo3(m.availableGrams),
                    consumedValue: roundTo2(m.consumedValue)
                }))
            } : null,
            scheme: activeSchemes.length > 0 && activeSchemes.some(s => s.consumedGrams > 0 || s.consumedValue > 0) ? {
                schemes: activeSchemes.map(s => ({
                    schemeId: s.schemeId,
                    schemeType: s.schemeType,
                    purity: s.purity,
                    initialGrams: s.initialGrams,
                    consumedRefGrams: roundTo4(s.consumedGrams),
                    remainingRefGrams: roundTo4(s.availableGrams),
                    consumedValue: roundTo2(s.consumedValue || 0),
                    makingDiscountPercent: s.makingDiscountPercent,
                    diamondDiscountPercent: s.diamondDiscountPercent
                })),
                consumedRefGrams: roundTo4(activeSchemes.reduce((s, sch) => s + sch.consumedGrams, 0)),
                remainingRefGrams: roundTo4(activeSchemes.reduce((s, sch) => s + sch.availableGrams, 0)),
                totalCustomerSavings: roundTo2(activeSchemes.reduce((s, sch) => s + (sch.consumedValue || 0), 0))
            } : null
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
        let totalCard = 0;
        let totalUpi = 0;
        let totalBank = 0;
        let totalOnline = 0;
        let totalCredit = 0;
        let totalSchemeRedemption = 0;
        let totalCreditMemo = 0;

        for (const payment of orderData.payments || []) {
            const amt = Number(payment.amount) || 0;
            if (payment.method === 'cash') {
                totalCash += amt;
            } else if (payment.method === 'card') {
                totalCard += amt;
                totalOnline += amt;
            } else if (payment.method === 'upi') {
                totalUpi += amt;
                totalOnline += amt;
            } else if (['neft', 'rtgs', 'neft_rtgs', 'bank_transfer'].includes(payment.method)) {
                totalBank += amt;
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
        const redeemedSchemeIds = [];
        const schemePayments = (orderData.payments || []).filter(p => p.method === 'scheme_redemption');
        const hasSchemesToRedeem = schemePayments.length > 0 || totalSchemeRedemption > 0 || (orderData.redeemedSchemeIds && orderData.redeemedSchemeIds.length > 0) || orderData.redeemedSchemeId;

        if (hasSchemesToRedeem) {
            const totalOrderAmount = Number(orderData.grandTotal || 0);
            if (!orderData.customerId) throw new ApiError(400, 'Customer ID is required to redeem a scheme');

            // Find all scheme redemption payment entries or redeemed scheme IDs
            let schemeTasks = schemePayments;
            if (schemeTasks.length === 0) {
                const rawIds = orderData.redeemedSchemeIds || (orderData.redeemedSchemeId ? [orderData.redeemedSchemeId] : []);
                schemeTasks = (Array.isArray(rawIds) ? rawIds : [rawIds]).map(id => ({ schemeId: id, amount: 0 }));
            }

            if (schemeTasks.length === 0) {
                throw new ApiError(400, 'Scheme ID is required for scheme redemption');
            }

            // Calculate total cart weights and charges for scheme eligibility
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

                    // Rule 7: Bullion restriction
                    if (category.includes('coin') || category.includes('bar') || title.includes('coin') || title.includes('gold bar')) {
                        throw new Error(`Bullion Restriction: Scheme is not applicable to coins or bars (${product.title || product.name}). Applicable to jewellery.`);
                    }

                    const itemNetWeight = Number(item.netWeight || product.netWeight || product.weight || 0) * (item.quantity || 1);
                    const itemGrossWeight = Number(item.grossWeight || product.metalDetails?.grossWeight || product.grossWeight || product.weight || itemNetWeight) * (item.quantity || 1);
                    totalNetGoldWeightRequired += itemNetWeight;

                    let itemMaking = Number(item.makingCharge || 0) * (item.quantity || 1);
                    if (!itemMaking) {
                        const unitMaking = Number(product.makingCharges || 0);
                        if (product.makingChargeType === 'per_gram') {
                            const w = hasSchemesToRedeem ? (itemGrossWeight > 0 ? itemGrossWeight : itemNetWeight) : itemNetWeight;
                            itemMaking = unitMaking * w;
                        } else {
                            itemMaking = unitMaking * (item.quantity || 1);
                        }
                    }
                    eligibleMakingCharges += itemMaking;

                    const itemDiamondVal = Number(item.stoneCharges || product.stoneCharges || 0) * (item.quantity || 1);
                    eligibleDiamondPrice += itemDiamondVal;
                    eligibleDiamondMaking += itemMaking;
                }
            }

            let remainingGoldWeightToCover = totalNetGoldWeightRequired;

            for (const sp of schemeTasks) {
                const targetSchemeId = sp.schemeId || sp.referenceId || orderData.redeemedSchemeId;
                if (!targetSchemeId) throw new ApiError(400, 'Scheme ID is required for each scheme redemption');

                const scheme = await tx.scheme.findUnique({
                    where: { id: targetSchemeId },
                    include: { customer: true, installments: true }
                });
                if (!scheme) throw new Error(`Scheme #${targetSchemeId} not found`);

                // Rule 10: Only the person in whose name the scheme is registered can redeem it
                if (scheme.customerId !== orderData.customerId) {
                    throw new Error('SECURITY ALERT: Unauthorized scheme redemption attempt. Scheme does not belong to this customer (Rule 10).');
                }

                if (scheme.status === 'closed') throw new Error(`Scheme #${scheme.schemeId || scheme.id} is already closed`);
                if (scheme.status === 'redeemed' && Number(scheme.accumulatedGrams || 0) <= Number(scheme.redeemedGrams || 0)) {
                    throw new Error(`Scheme #${scheme.schemeId || scheme.id} has already been fully redeemed`);
                }

                // Rule 5, 13 & 22: Tiered Benefit Ratio (4 Tiers)
                const monthlyInst = Number(scheme.monthlyInstallment || 1);
                const totalPaid = Number(scheme.totalPaid || 0);
                const totalMonths = Number(scheme.totalMonths || 11);
                const paidInstallmentCount = Math.min(totalMonths, Math.floor(totalPaid / (monthlyInst > 0 ? monthlyInst : 1)));

                const enrollmentDate = new Date(scheme.startDate || scheme.createdAt);
                const daysSinceEnrollment = Math.floor((new Date() - enrollmentDate) / (1000 * 60 * 60 * 24));

                let benefitRatio = 0;
                let benefitTier = 'NO_BENEFIT';
                const isFullTenure = scheme.status === 'matured' || scheme.status === 'completed' || (paidInstallmentCount >= totalMonths) || (daysSinceEnrollment >= 330 && daysSinceEnrollment <= 365);
                const isHalfTenure = !isFullTenure && ((paidInstallmentCount >= Math.ceil(totalMonths / 2)) || (daysSinceEnrollment >= 180 && daysSinceEnrollment < 330));

                if (isFullTenure) {
                    benefitRatio = 1.0;
                    benefitTier = 'FULL_TENURE_100_PERCENT_BENEFIT';
                } else if (!isFullTenure && daysSinceEnrollment >= 365) {
                    benefitRatio = 0;
                    benefitTier = 'EXPIRED_365_DAYS_ZERO_BENEFIT';
                } else if (isHalfTenure) {
                    benefitRatio = 0.5;
                    benefitTier = 'TENURE_6_TO_11_MONTHS_PARTIAL_BENEFIT';
                } else {
                    benefitRatio = 0;
                    benefitTier = 'TENURE_UNDER_6_MONTHS_ZERO_BENEFIT';
                }

                // Rule 9: PAN card mandatory for purchases exceeding ₹2,00,000
                const customerPan = scheme.customer?.panNumber || orderData.customerPan;
                if (totalOrderAmount > 200000 && !customerPan) {
                    throw new Error('Rule 9 Mandatory Requirement: PAN card is required for jewellery purchases exceeding ₹2,00,000.');
                }

                // Rule 18 & 19: No additional promotional coupons or vouchers can be combined with scheme benefit
                if (orderData.couponCode || orderData.voucherCode) {
                    throw new Error('Rule 18 & 19 Restriction: Additional promotional coupons or vouchers cannot be combined with scheme benefit redemption.');
                }
                if (orderData.discount && Number(orderData.discount) > 0 && !orderData.isSchemeDiscount) {
                    throw new Error('Rule 18 & 19 Restriction: Additional manual discounts cannot be combined with scheme benefit redemption.');
                }

                // Rule 26 & Management Authorization: Dual OTP Verification
                const schemeOtp = sp.otp || orderData.schemeOtp;
                const managementOtp = sp.managementOtp || orderData.managementOtp;
                const MANAGEMENT_PHONE = process.env.MANAGEMENT_SCHEME_OTP_PHONE || '7887973088';

                const { cacheHelper } = require('../../config');
                let customerPreVerified = false;
                let mgmtPreVerified = false;
                if (cacheHelper) {
                    customerPreVerified = await cacheHelper.get(`scheme_customer_verified_${scheme.id}`);
                    mgmtPreVerified = await cacheHelper.get(`scheme_mgmt_verified_${scheme.id}`);
                }

                // Step 1: Mandatory Customer OTP Verification
                if (!schemeOtp && !customerPreVerified && !orderData.overrideSchemeOtp) {
                    throw new Error(`Rule 26 Mandatory Requirement: Customer OTP verification is required to authorize redemption of scheme #${scheme.schemeId || scheme.id}.`);
                }
                if (schemeOtp && !orderData.overrideSchemeOtp) {
                    const otpService = require('../../utils/otpService');
                    await otpService.verifyOTP(scheme.customer.phone, schemeOtp, false);
                }

                // Step 2: Mandatory Management OTP Verification
                if (!managementOtp && !mgmtPreVerified && !orderData.overrideSchemeOtp) {
                    throw new Error(`Management Security Alert: Management OTP verification (sent to ${MANAGEMENT_PHONE}) is mandatory for scheme #${scheme.schemeId || scheme.id}. Sales executive cannot redeem without management approval.`);
                }
                if (managementOtp && !orderData.overrideSchemeOtp) {
                    const otpService = require('../../utils/otpService');
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
                    if (!isMgmtValid && !mgmtPreVerified) {
                        throw new Error(`Invalid or expired Management OTP for ${MANAGEMENT_PHONE} on scheme #${scheme.schemeId || scheme.id}.`);
                    }
                }

                // Clear scheme verification flags after successful billing usage
                if (cacheHelper) {
                    await cacheHelper.del(`scheme_customer_verified_${scheme.id}`).catch(() => {});
                    await cacheHelper.del(`scheme_mgmt_verified_${scheme.id}`).catch(() => {});
                }

                let metaDiscounts = {};
                try {
                    if (scheme.notes && scheme.notes.trim().startsWith('{')) {
                        metaDiscounts = JSON.parse(scheme.notes);
                    }
                } catch (e) { }

                const thisSchemeAppliedAmount = Number(sp.amount || 0);
                let newRedeemedGrams = Number(scheme.redeemedGrams || 0);
                let leftoverGrams = 0;
                let gramsDebited = 0;
                let missingGrams = 0;
                let newStatus = 'redeemed';
                let schemeRedemptionAudit = null;

                if (scheme.schemeType === 'GOLD') {
                    const totalAccumulated = Number(scheme.accumulatedGrams || 0);
                    const currentRedeemed = Number(scheme.redeemedGrams || 0);
                    const availableGrams = Number(Math.max(0, totalAccumulated - currentRedeemed).toFixed(4));

                    if (availableGrams <= 0) {
                        throw new Error(`Scheme #${scheme.schemeId || scheme.id} has zero remaining gold grams available for redemption.`);
                    }

                    const weightToDebitAgainst = remainingGoldWeightToCover > 0 ? remainingGoldWeightToCover : availableGrams;
                    gramsDebited = Number(Math.min(availableGrams, weightToDebitAgainst).toFixed(4));
                    leftoverGrams = Number(Math.max(0, availableGrams - gramsDebited).toFixed(4));
                    missingGrams = Number(Math.max(0, weightToDebitAgainst - availableGrams).toFixed(4));
                    newRedeemedGrams = Number((currentRedeemed + gramsDebited).toFixed(4));
                    newStatus = leftoverGrams > 0.0001 ? 'partially_redeemed' : 'redeemed';
                    remainingGoldWeightToCover = Math.max(0, remainingGoldWeightToCover - gramsDebited);

                    let schemeGoldRateUsed = null;
                    const p = String(scheme.purity || '22K').trim().toUpperCase();
                    const aliases = (p === '22K' || p === '916' || p === '22KT') ? ['22K', '916', '22KT'] :
                                    (p === '18K' || p === '750' || p === '18KT') ? ['18K', '750', '18KT'] :
                                    (p === '14K' || p === '585' || p === '14KT') ? ['14K', '585', '14KT'] :
                                    (p === '24K' || p === '999' || p === '24KT') ? ['24K', '999', '24KT'] : [p];

                    const schemeRateRecord = await tx.schemeGoldRate.findFirst({
                        where: {
                            metal: { equals: 'gold', mode: 'insensitive' },
                            purity: { in: aliases, mode: 'insensitive' }
                        },
                        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }]
                    });
                    if (schemeRateRecord) {
                        schemeGoldRateUsed = Number(Number(schemeRateRecord.ratePerGram).toFixed(2));
                    }

                    const configuredGoldFull = Number(metaDiscounts.goldMakingDiscountFull || metaDiscounts.goldMakingDiscountUpToFull || 100);
                    const configuredGoldHalf = Number(metaDiscounts.goldMakingDiscountUpToHalf || 50);
                    const makingDiscountPercent = benefitRatio === 1.0 ? configuredGoldFull : (benefitRatio === 0.5 ? configuredGoldHalf : 0);
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
                    const configuredDiaFull = Number(metaDiscounts.diamondFlatDiscountFull || 40);
                    const configuredDiaHalf = Number(metaDiscounts.diamondFlatDiscountHalf || 20);
                    const configuredDiaMakingFull = Number(metaDiscounts.diamondMakingDiscountFull || metaDiscounts.diamondMakingFlatDiscountFull || 40);
                    const configuredDiaMakingHalf = Number(metaDiscounts.diamondMakingDiscountHalf || metaDiscounts.diamondMakingFlatDiscountHalf || 20);

                    const diamondDiscountPercent = benefitRatio === 1.0 ? configuredDiaFull : (benefitRatio === 0.5 ? configuredDiaHalf : 0);
                    const makingDiscountPercent = benefitRatio === 1.0 ? configuredDiaMakingFull : (benefitRatio === 0.5 ? configuredDiaMakingHalf : 0);
                    const diamondDiscountAmount = roundTo2(eligibleDiamondPrice * (diamondDiscountPercent / 100));
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
                const recordedRedemptionAmount = thisSchemeAppliedAmount > 0 
                    ? thisSchemeAppliedAmount 
                    : (scheme.schemeType === 'GOLD' ? roundTo2(gramsDebited * (schemeGoldRateUsed || 0)) : Number(scheme.totalPaid || 0));

                await tx.scheme.update({
                    where: { id: scheme.id },
                    data: {
                        redeemedGrams: newRedeemedGrams,
                        status: newStatus,
                        redemptionDate: new Date(),
                        redemptionValue: (Number(scheme.redemptionValue || 0) + recordedRedemptionAmount)
                    }
                });

                // Activity Log for Scheme Redemption
                await tx.schemeActivityLog.create({
                    data: {
                        schemeId: scheme.id,
                        action: 'REDEMPTION',
                        description: `Scheme redeemed on order ${orderNumber}. Applied: ₹${recordedRedemptionAmount.toLocaleString('en-IN')}.${scheme.schemeType === 'GOLD' ? ` Debited: ${gramsDebited}g, Leftover: ${leftoverGrams}g.` : ''}`,
                        details: {
                            orderNumber,
                            totalOrderAmount,
                            thisSchemeAppliedAmount,
                            daysSinceEnrollment,
                            customerPhone: scheme.customer?.phone,
                            managementPhone: MANAGEMENT_PHONE,
                            managementAuthorized: true,
                            customerPan: customerPan ? `****${customerPan.slice(-4)}` : null,
                            ...schemeRedemptionAudit
                        },
                        performedById: orderData.billedBy
                    }
                });

                redeemedSchemeIds.push(scheme.id);
                // Append Scheme tag to order notes so printable invoice and reprints can parse it
                orderData.notes = (orderData.notes ? orderData.notes + '||' : '') + `PAYMENT_REF:scheme:${scheme.schemeId || scheme.id}:${thisSchemeAppliedAmount}:GRAMS:${gramsDebited}:TYPE:${scheme.schemeType}:DISC:${schemeRedemptionAudit?.makingDiscountPercent || 0}`;
            }
        }

        // 3. Handle Credit Memo Redemption
        if (totalCreditMemo > 0) {
            const verifiedCustomerPhonesInBatch = new Set();
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
                    const otp = payment.otp || payment.redemptionOtp || orderData.creditMemoOtp;
                    if (!payment.skipOtp && !orderData.skipCreditMemoOtp) {
                        if (!otp) {
                            throw new ApiError(400, `Security Requirement: Customer OTP verification is required to redeem Credit Memo #${memo.memoId}.`);
                        }
                        const cleanCustomerPhone = memo.customer?.phone ? String(memo.customer.phone).replace(/\D/g, '').slice(-10) : null;
                        let otpVerified = false;

                        // If this customer's OTP was already verified in this batch, approve seamlessly
                        if (cleanCustomerPhone && verifiedCustomerPhonesInBatch.has(cleanCustomerPhone)) {
                            otpVerified = true;
                        } else {
                            const otpService = require('../../utils/otpService');
                            const otpKey = `credit_memo_otp_${memo.memoId}`;
                            try {
                                await otpService.verifyOTP(otpKey, String(otp).trim(), false);
                                otpVerified = true;
                            } catch (e1) {
                                if (cleanCustomerPhone) {
                                    try {
                                        await otpService.verifyOTP(cleanCustomerPhone, String(otp).trim(), false);
                                        otpVerified = true;
                                    } catch (e2) { }
                                }
                            }
                        }

                        if (otpVerified && cleanCustomerPhone) {
                            verifiedCustomerPhonesInBatch.add(cleanCustomerPhone);
                        } else if (!otpVerified) {
                            throw new ApiError(400, `Invalid or expired OTP for Credit Memo #${memo.memoId}. Redemption denied for security.`);
                        }
                    }

                    const newBalance = Math.max(0, Number(memo.balance) - parsedAmount);
                    let newRemainingGrams = memo.remainingGrams;
                    let newRemainingPureGrams = memo.remainingPureGrams;

                    let gramsConsumed = 0;
                    const refPurity = memo.referencePurity || memo.exchangePurity || '22K';

                    if (newBalance <= 0) {
                        gramsConsumed = Number(memo.remainingGrams || 0);
                        newRemainingGrams = 0;
                        newRemainingPureGrams = 0;
                    } else if (memo.lockedGoldRate && Number(memo.lockedGoldRate) > 0) {
                        gramsConsumed = parsedAmount / Number(memo.lockedGoldRate);
                        if (memo.remainingGrams !== null && memo.remainingGrams !== undefined) {
                            newRemainingGrams = Math.max(0, Number((Number(memo.remainingGrams) - gramsConsumed).toFixed(4)));
                        }
                        if (memo.remainingPureGrams !== null && memo.remainingPureGrams !== undefined) {
                            const pureGramsConsumed = toPureGoldGrams(gramsConsumed, refPurity);
                            newRemainingPureGrams = Math.max(0, Number((Number(memo.remainingPureGrams) - pureGramsConsumed).toFixed(4)));
                        }
                    }

                    await tx.creditMemo.update({
                        where: { id: memo.id },
                        data: {
                            balance: newBalance,
                            remainingGrams: newRemainingGrams,
                            remainingPureGrams: newRemainingPureGrams,
                            status: newBalance <= 0 ? 'applied' : 'active'
                        }
                    });

                    // Store reference for invoice re-printing with grams and locked rate details
                    const memoTag = (memo.lockedGoldRate && Number(memo.lockedGoldRate) > 0)
                        ? `PAYMENT_REF:credit_memo:${memo.memoId}:${parsedAmount}:GRAMS:${Number(gramsConsumed.toFixed(3))}:PURITY:${refPurity}:RATE:${memo.lockedGoldRate}`
                        : `PAYMENT_REF:credit_memo:${memo.memoId}:${parsedAmount}`;
                    orderData.notes = (orderData.notes ? orderData.notes + '||' : '') + memoTag;
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
                cardPaid: totalCard,
                upiPaid: totalUpi + totalBank,
                creditUsed: totalCredit + totalCreditMemo + totalSchemeRedemption,
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
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                metalDetails: true,
                                stoneDetails: true,
                                images: true
                            }
                        }
                    }
                }
            }
        });

        // Link Scheme Redemption to Order
        if (redeemedSchemeIds.length > 0) {
            for (const rSchemeId of redeemedSchemeIds) {
                await tx.scheme.update({
                    where: { id: rSchemeId },
                    data: { redemptionOrderId: order.id }
                });
            }
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

        // 7b. Handle Customer Credit Memo redemption in Ledger
        if (totalCreditMemo > 0 && orderData.customerId && ledgerService.recordTransactionPrisma) {
            await ledgerService.recordTransactionPrisma({
                customerId: orderData.customerId,
                type: 'debit',
                amount: totalCreditMemo,
                transactionType: 'credit_memo_redemption',
                referenceId: order.id,
                referenceModel: 'POSOrder',
                paymentMethod: 'credit_memo',
                notes: `Advance adjusted via Credit Memo in Order ${order.orderNumber}`,
                performedBy: orderData.billedBy
            }, tx);
        }

        // 8. Award loyalty points & send Email
        let user = null;
        if (orderData.customerId) {
            user = await tx.user.findUnique({ where: { id: orderData.customerId } });
            if (user && loyaltyService.awardPointsPrisma) {
                await loyaltyService.awardPointsPrisma(user.id, orderData.grandTotal, tx);
            }
        }

        const recipientEmail = (user && user.email) || orderData.customerEmail || orderData.customer?.email;
        if (recipientEmail) {
            try {
                order.payments = orderData.payments || [];
                order.customer = user || orderData.customer || null;
                const recipientName = (user && user.name) || orderData.customerName || orderData.customer?.name || 'Valued Customer';
                const emailContent = generatePOSBillEmail(order, recipientName);
                await sendEmail({
                    to: recipientEmail,
                    emailType: 'customer',
                    subject: emailContent.subject,
                    text: emailContent.text,
                    html: emailContent.html
                });
            } catch (err) {
                console.error(`Failed to queue POS email for ${recipientEmail}: ${err.message}`);
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
        let s = new Date(startDate);
        let e = new Date(endDate);
        if (isNaN(s.getTime())) s = new Date();
        if (isNaN(e.getTime())) e = new Date();
        if (s > e) { const tmp = s; s = e; e = tmp; }
        where.createdAt = { gte: s, lte: e };
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

    let startDateTime = new Date(startDate);
    let endDateTime = new Date(endDate);
    if (isNaN(startDateTime.getTime())) startDateTime = new Date();
    if (isNaN(endDateTime.getTime())) endDateTime = new Date();
    if (startDateTime > endDateTime) {
        const temp = startDateTime;
        startDateTime = endDateTime;
        endDateTime = temp;
    }

    const stats = await prisma.pOSOrder.aggregate({
        where: {
            ...(storeId ? { storeId: storeId } : {}),
            createdAt: { gte: startDateTime, lte: endDateTime },
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
            createdAt: { gte: startDateTime, lte: endDateTime }
        },
        _sum: { grandTotal: true },
        _count: { id: true }
    });

    const creditMemoStats = await prisma.creditMemo.aggregate({
        where: {
            createdAt: { gte: startDateTime, lte: endDateTime }
        },
        _sum: { originalAmount: true },
        _count: { id: true }
    });

    // Fetch full POS Orders with line items, metalDetails and stoneDetails
    const posOrdersRaw = await prisma.pOSOrder.findMany({
        where: {
            ...(storeId ? { storeId: storeId } : {}),
            createdAt: { gte: startDateTime, lte: endDateTime },
            status: 'completed'
        },
        include: {
            items: {
                include: {
                    product: {
                        include: {
                            metalDetails: true,
                            stoneDetails: true
                        }
                    }
                }
            }
        },
        orderBy: { createdAt: 'asc' }
    });

    // Fetch Gold Bar Sales
    const goldBarSalesRaw = await prisma.goldBarSale.findMany({
        where: {
            createdAt: { gte: startDateTime, lte: endDateTime },
            status: { not: 'cancelled' }
        },
        orderBy: { createdAt: 'asc' }
    });

    const imitationSalesRaw = await prisma.imitationSale.findMany({
        where: { createdAt: { gte: startDateTime, lte: endDateTime } },
        select: { createdAt: true, grandTotal: true },
        orderBy: { createdAt: 'asc' }
    });

    const creditMemosRaw = await prisma.creditMemo.findMany({
        where: { createdAt: { gte: startDateTime, lte: endDateTime } },
        select: { createdAt: true, originalAmount: true },
        orderBy: { createdAt: 'asc' }
    });

    const repairsRaw = await prisma.repair.findMany({
        where: {
            createdAt: { gte: startDateTime, lte: endDateTime },
            ...(storeId ? { storeId: storeId } : {})
        },
        select: { createdAt: true, actualCost: true, estimatedCost: true, status: true },
        orderBy: { createdAt: 'asc' }
    });

    const onlineOrdersRaw = includeOnline ? await prisma.order.findMany({
        where: { createdAt: { gte: startDateTime, lte: endDateTime }, paymentStatus: 'completed' },
        select: { createdAt: true, grandTotal: true },
        orderBy: { createdAt: 'asc' }
    }) : [];

    // Customer tracking
    const uniqueCustomerIds = new Set();
    posOrdersRaw.forEach(order => {
        if (order.customerId) uniqueCustomerIds.add(order.customerId);
    });
    const totalCustomers = uniqueCustomerIds.size;

    // Detailed categorization: Gold Products vs Diamond Products
    let goldProductSalesTotal = 0;
    let goldProductCount = 0;
    let goldProductWeightTotal = 0;

    let diamondProductSalesTotal = 0;
    let diamondProductCount = 0;
    let diamondProductCaratTotal = 0;

    // Data lists for timeline grouping
    const goldTimePoints = [];
    const diamondTimePoints = [];
    const overallTimePoints = [];

    posOrdersRaw.forEach(order => {
        let orderRawGold = 0;
        let orderRawDiamond = 0;
        const grandTotal = Number(order.grandTotal || 0);

        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                const prod = item.product;
                const itemTotal = Number(item.totalPrice != null ? item.totalPrice : (Number(item.unitPrice || 0) * (item.quantity || 1)));
                const qty = Number(item.quantity || 1);

                // Identify if product is a genuine Diamond product
                const hasDiamonds = (prod?.stoneDetails || []).some(s =>
                    (s.stoneType || '').trim().toLowerCase() === 'diamond'
                ) || (prod?.productType || '').toLowerCase().includes('diamond');

                if (hasDiamonds) {
                    orderRawDiamond += itemTotal;
                    diamondProductCount += qty;
                    const carats = (prod?.stoneDetails || []).reduce((c, s) => {
                        const isDia = (s.stoneType || '').trim().toLowerCase() === 'diamond';
                        return c + (isDia ? Number(s.carat || 0) : 0);
                    }, 0);
                    diamondProductCaratTotal += carats * qty;
                } else {
                    orderRawGold += itemTotal;
                    goldProductCount += qty;
                    const wt = Number(prod?.metalDetails?.netWeight || prod?.metalDetails?.grossWeight || 0);
                    goldProductWeightTotal += wt * qty;
                }
            });

            // Reconcile order level grandTotal into gold vs diamond revenue
            const totalRaw = orderRawGold + orderRawDiamond;
            let orderGold = 0;
            let orderDiamond = 0;

            if (totalRaw > 0) {
                orderDiamond = Number((grandTotal * (orderRawDiamond / totalRaw)).toFixed(2));
                orderGold = Number((grandTotal - orderDiamond).toFixed(2));
            } else if (orderRawDiamond > 0) {
                orderDiamond = grandTotal;
            } else {
                orderGold = grandTotal;
            }

            diamondProductSalesTotal += orderDiamond;
            goldProductSalesTotal += orderGold;

            if (orderGold > 0) goldTimePoints.push({ createdAt: order.createdAt, amount: orderGold });
            if (orderDiamond > 0) diamondTimePoints.push({ createdAt: order.createdAt, amount: orderDiamond });
        } else {
            // Fallback for orders without item breakdown: attribute to Gold
            goldProductSalesTotal += grandTotal;
            goldProductCount += 1;
            if (grandTotal > 0) goldTimePoints.push({ createdAt: order.createdAt, amount: grandTotal });
        }

        overallTimePoints.push({ createdAt: order.createdAt, amount: grandTotal });
    });

    // Gold Bar totals & time points
    let goldBarSalesTotal = 0;
    let goldBarCount = goldBarSalesRaw.length;
    let goldBarWeightTotal = 0;
    let goldBarQuantityTotal = 0;
    const goldBarTimePoints = [];

    goldBarSalesRaw.forEach(sale => {
        const amt = Number(sale.grandTotal || 0);
        const wt = Number(sale.netWeight || sale.grossWeight || 0);
        const qty = Number(sale.quantity || 1);

        goldBarSalesTotal += amt;
        goldBarWeightTotal += wt;
        goldBarQuantityTotal += qty;

        goldBarTimePoints.push({ createdAt: sale.createdAt, amount: amt });
        overallTimePoints.push({ createdAt: sale.createdAt, amount: amt });
    });

    // Imitation time points into overall
    imitationSalesRaw.forEach(sale => {
        overallTimePoints.push({ createdAt: sale.createdAt, amount: Number(sale.grandTotal || 0) });
    });

    // Repair services totals & time points
    let repairSalesTotal = 0;
    let repairCount = (repairsRaw || []).length;
    const repairTimePoints = [];

    (repairsRaw || []).forEach(r => {
        const amt = Number(r.actualCost != null && Number(r.actualCost) > 0 ? r.actualCost : (r.estimatedCost || 0));
        repairSalesTotal += amt;
        repairTimePoints.push({ createdAt: r.createdAt, amount: amt });
        if (amt > 0) {
            overallTimePoints.push({ createdAt: r.createdAt, amount: amt });
        }
    });

    // Dynamic Chart Grouping Logic
    const diffTime = Math.abs(endDateTime - startDateTime);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const getTimeLabel = (dateObj) => {
        if (diffDays <= 1) {
            const hr = dateObj.getHours();
            return `${hr % 12 || 12}${hr < 12 ? 'am' : 'pm'}`;
        } else if (diffDays <= 7) {
            return dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        } else if (diffDays <= 31) {
            return dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        } else {
            return dateObj.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        }
    };

    const sortByTime = (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

    const groupDataByTime = (data) => {
        const sorted = [...(data || [])].sort(sortByTime);
        const map = new Map();
        sorted.forEach(item => {
            const date = new Date(item.createdAt);
            const label = getTimeLabel(date);
            map.set(label, (map.get(label) || 0) + Number(item.amount || item.grandTotal || item.originalAmount || 0));
        });

        const arr = Array.from(map, ([name, sales]) => ({ name, sales: Math.round(sales) }));
        return arr;
    };

    // Multi-series All Products chart data (chronologically ordered)
    const combinedProductEvents = [
        ...goldTimePoints.map(p => ({ createdAt: p.createdAt, category: 'gold', amount: p.amount })),
        ...diamondTimePoints.map(p => ({ createdAt: p.createdAt, category: 'diamond', amount: p.amount })),
        ...goldBarTimePoints.map(p => ({ createdAt: p.createdAt, category: 'goldBar', amount: p.amount })),
        ...imitationSalesRaw.map(p => ({ createdAt: p.createdAt, category: 'imitation', amount: Number(p.grandTotal || 0) })),
        ...repairTimePoints.map(p => ({ createdAt: p.createdAt, category: 'repair', amount: p.amount }))
    ].sort(sortByTime);

    const allProductsMap = new Map();
    combinedProductEvents.forEach(evt => {
        const date = new Date(evt.createdAt);
        const label = getTimeLabel(date);

        if (!allProductsMap.has(label)) {
            allProductsMap.set(label, { name: label, gold: 0, diamond: 0, goldBar: 0, imitation: 0, repair: 0, total: 0 });
        }
        const entry = allProductsMap.get(label);
        const val = Math.round(Number(evt.amount || 0));
        entry[evt.category] = (entry[evt.category] || 0) + val;
        entry.total = (entry.total || 0) + val;
    });
    const allProductsChart = Array.from(allProductsMap.values());

    // Month-wise aggregation chart
    const monthMap = new Map();
    overallTimePoints.sort(sortByTime).forEach(item => {
        const date = new Date(item.createdAt);
        const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (!monthMap.has(monthLabel)) {
            monthMap.set(monthLabel, { name: monthLabel, sales: 0, orders: 0 });
        }
        const mEntry = monthMap.get(monthLabel);
        mEntry.sales += Math.round(Number(item.amount || 0));
        mEntry.orders += 1;
    });
    const monthWiseChart = Array.from(monthMap.values());

    // Year-wise chart grouping
    const yearMap = new Map();
    overallTimePoints.sort(sortByTime).forEach(item => {
        const date = new Date(item.createdAt);
        const yr = String(date.getFullYear());
        if (!yearMap.has(yr)) {
            yearMap.set(yr, { name: yr, sales: 0, orders: 0 });
        }
        const yrEntry = yearMap.get(yr);
        yrEntry.sales += Math.round(Number(item.amount || 0));
        yrEntry.orders += 1;
    });
    const yearWiseChart = Array.from(yearMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    // Date-wise granular timeline chart
    const dateWiseMap = new Map();
    overallTimePoints.sort(sortByTime).forEach(item => {
        const date = new Date(item.createdAt);
        let label = '';
        if (diffDays <= 1) {
            const hr = date.getHours();
            label = `${hr % 12 || 12}${hr < 12 ? 'am' : 'pm'}`;
        } else {
            label = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        }

        if (!dateWiseMap.has(label)) {
            dateWiseMap.set(label, { name: label, sales: 0, orders: 0 });
        }
        const dEntry = dateWiseMap.get(label);
        dEntry.sales += Math.round(Number(item.amount || 0));
        dEntry.orders += 1;
    });
    const dateWiseChart = Array.from(dateWiseMap.values());

    const charts = {
        gold: groupDataByTime(goldTimePoints),
        diamond: groupDataByTime(diamondTimePoints),
        goldBar: groupDataByTime(goldBarTimePoints),
        overall: groupDataByTime(overallTimePoints),
        imitation: groupDataByTime(imitationSalesRaw),
        credit: groupDataByTime(creditMemosRaw),
        repair: groupDataByTime(repairTimePoints),
        allProducts: allProductsChart,
        dateWise: dateWiseChart,
        monthWise: monthWiseChart,
        yearWise: yearWiseChart
    };

    // Safe Numeric Conversions (Prisma Decimal handles safely)
    const posOrdersTotalNum = Number(stats._sum.grandTotal || 0);
    const posTaxTotalNum = Number(stats._sum.taxTotal || 0);
    const imitationTotalNum = Number(imitationStats._sum.grandTotal || 0);
    const creditMemoTotalNum = Number(creditMemoStats._sum.originalAmount || 0);

    const combinedTotalSales = posOrdersTotalNum + Number(goldBarSalesTotal || 0) + imitationTotalNum + repairSalesTotal;

    return [{
        totalSales: Number(combinedTotalSales.toFixed(2)),
        posOrdersTotal: Number(posOrdersTotalNum.toFixed(2)),
        orderCount: (stats._count.id || 0) + goldBarCount + (imitationStats._count.id || 0) + repairCount,
        totalGST: Number(posTaxTotalNum.toFixed(2)),

        // Gold Products
        goldProductSalesTotal: Number(goldProductSalesTotal.toFixed(2)),
        goldProductCount,
        goldProductWeightTotal: Number(goldProductWeightTotal.toFixed(3)),

        // Diamond Products
        diamondProductSalesTotal: Number(diamondProductSalesTotal.toFixed(2)),
        diamondProductCount,
        diamondProductCaratTotal: Number(diamondProductCaratTotal.toFixed(3)),

        // Gold Bars
        goldBarSalesTotal: Number(goldBarSalesTotal.toFixed(2)),
        goldBarCount,
        goldBarWeightTotal: Number(goldBarWeightTotal.toFixed(3)),
        goldBarQuantityTotal,

        // Imitation & Credit Memos & Repairs
        imitationSalesTotal: Number(imitationTotalNum.toFixed(2)),
        imitationCount: imitationStats._count.id || 0,
        creditMemoTotal: Number(creditMemoTotalNum.toFixed(2)),
        creditMemoCount: creditMemoStats._count.id || 0,
        repairSalesTotal: Number(repairSalesTotal.toFixed(2)),
        repairCount,

        totalCustomers: totalCustomers || 0,
        charts
    }];
};

const processReturn = async (orderId, returnData, performedBy) => {
    return await prisma.$transaction(async (tx) => {
        const order = await tx.pOSOrder.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                metalDetails: true,
                                stoneDetails: true,
                                images: true
                            }
                        }
                    }
                }
            }
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
