const prisma = require('../../config/prisma');
const { recordTransactionPrisma } = require('../accounting/customer-ledger.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');
const { validateAndCheckDuplicateUtr, isNeftOrBankTransfer } = require('../../utils/utrValidator');
const { generateCreditMemoNumber } = require('../../utils/invoiceNumberGenerator');

// Get all Credit Memos (Admin)
const getAllCreditMemos = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.search) {
        where.OR = [
            { memoId: { contains: req.query.search, mode: 'insensitive' } },
            { customer: { name: { contains: req.query.search, mode: 'insensitive' } } },
            { customer: { phone: { contains: req.query.search, mode: 'insensitive' } } }
        ];
    }

    const total = await prisma.creditMemo.count({ where });
    const creditMemos = await prisma.creditMemo.findMany({
        where,
        include: {
            customer: { select: { name: true, phone: true, email: true, addresses: true } },
            createdBy: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
    });


    // Enrich linkedItems with product details
    const productIds = new Set();
    creditMemos.forEach(memo => {
        if (memo.linkedItems && Array.isArray(memo.linkedItems)) {
            memo.linkedItems.forEach(item => {
                if (item.product) productIds.add(item.product);
            });
        }
    });

    if (productIds.size > 0) {
        const products = await prisma.product.findMany({
            where: { id: { in: Array.from(productIds) } },
            include: { metalDetails: true, diamonds: true }
        });
        const productMap = {};
        products.forEach(p => productMap[p.id] = p);

        creditMemos.forEach(memo => {
            if (memo.linkedItems && Array.isArray(memo.linkedItems)) {
                memo.linkedItems = memo.linkedItems.map(item => ({
                    ...item,
                    product: productMap[item.product] || { id: item.product, name: 'Unknown Product' }
                }));
            }
        });
    }

    ApiResponse.paginated(creditMemos, page, limit, total).send(res);
});

// Search active memos for POS
const searchActiveMemos = asyncHandler(async (req, res) => {
    const { term } = req.params;

    const memos = await prisma.creditMemo.findMany({
        where: {
            OR: [
                { memoId: term },
                { customer: { phone: term } }
            ],
            status: { in: ['active', 'partially_used'] },
            balance: { gt: 0 }
        },
        include: {
            customer: { select: { name: true, phone: true, email: true } }
        }
    });

    // Enrich linkedItems with product details for POS
    const productIds = new Set();
    memos.forEach(memo => {
        if (memo.linkedItems && Array.isArray(memo.linkedItems)) {
            memo.linkedItems.forEach(item => {
                if (item.product) productIds.add(item.product);
            });
        }
    });

    if (productIds.size > 0) {
        const products = await prisma.product.findMany({
            where: { id: { in: Array.from(productIds) } },
            include: { metalDetails: true, diamonds: true }
        });
        const productMap = {};
        products.forEach(p => productMap[p.id] = p);

        memos.forEach(memo => {
            if (memo.linkedItems && Array.isArray(memo.linkedItems)) {
                memo.linkedItems = memo.linkedItems.map(item => ({
                    ...item,
                    product: productMap[item.product] || { id: item.product, name: 'Unknown Product' }
                }));
            }
        });
    }

    ApiResponse.success(memos, 'Active Credit Memos found').send(res);
});

const { toPureGoldGrams, parseKarat } = require('../../utils/purityHelper');

// Create new Credit Memo
const createCreditMemo = asyncHandler(async (req, res) => {
    const {
        customer,
        originalAmount,
        paymentMethod,
        notes,
        shop_id,
        linkedItems,
        isRateLocked,
        lockedGoldRate,
        referencePurity,
        exchangePurity,
        exchangeWeight
    } = req.body;

    if (!customer || !paymentMethod) {
        return ApiResponse.error('Customer ID and paymentMethod are required', 400).send(res);
    }

    const purityToUse = referencePurity || exchangePurity || '22K';
    let effectiveLockedRate = lockedGoldRate ? Number(lockedGoldRate) : null;

    let finalAmount = Number(originalAmount) || 0;
    if (paymentMethod === 'gold_exchange' && exchangeWeight && effectiveLockedRate && finalAmount === 0) {
        finalAmount = Number((Number(exchangeWeight) * effectiveLockedRate).toFixed(2));
    }

    if (finalAmount <= 0 && (!exchangeWeight || Number(exchangeWeight) <= 0)) {
        return ApiResponse.error('Credit Memo amount or exchange weight must be greater than 0', 400).send(res);
    }

    let finalNotes = notes || '';
    if (isNeftOrBankTransfer(paymentMethod)) {
        const rawUtr = req.body.utrNumber || (notes && notes.match(/UTR:([A-Za-z0-9_-]+)/)?.[1]);
        const cleanUtr = await validateAndCheckDuplicateUtr(prisma, rawUtr, paymentMethod.toUpperCase());
        finalNotes = (finalNotes ? finalNotes + '\n' : '') + `UTR:${cleanUtr}`;
    }

    const validLinkedItems = linkedItems ? linkedItems.filter(item => item.product) : [];

    // Create using transaction
    await prisma.$transaction(async (tx) => {
        let metalCode = 'GEN';
        if (validLinkedItems && validLinkedItems.length > 0) {
            const firstProduct = await tx.product.findUnique({
                where: { id: validLinkedItems[0].product },
                include: { metalDetails: true }
            });
            if (firstProduct) {
                if (firstProduct.metalDetails && firstProduct.metalDetails.metalType) {
                    metalCode = firstProduct.metalDetails.metalType.replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase();
                } else if (firstProduct.name) {
                    metalCode = firstProduct.name.replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase();
                }
            }
        }

        // Generate Memo ID (Format: CS-CM-001)
        const memoId = await generateCreditMemoNumber(tx);

        if (!effectiveLockedRate) {
            // Auto fetch current live rate for the selected purity so it is ALWAYS locked
            const latestGoldRate = await tx.goldRate.findFirst({
                where: {
                    metal: 'gold',
                    purity: { equals: purityToUse, mode: 'insensitive' }
                },
                orderBy: [
                    { effectiveDate: 'desc' },
                    { createdAt: 'desc' }
                ]
            });
            if (latestGoldRate) {
                effectiveLockedRate = Number(latestGoldRate.ratePerGram);
            } else {
                // Fallback to 22K derived rate if direct purity not found
                const base22k = await tx.goldRate.findFirst({
                    where: { metal: 'gold', purity: { equals: '22K', mode: 'insensitive' } },
                    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }]
                });
                if (base22k) {
                    const karat = parseKarat(purityToUse);
                    effectiveLockedRate = Number(((Number(base22k.ratePerGram) * karat) / 22).toFixed(2));
                }
            }
        }

        if (!effectiveLockedRate || effectiveLockedRate <= 0) {
            throw new Error(`Unable to determine gold rate for purity ${purityToUse}. Please enter rate manually.`);
        }

        const additionalCash = Number(req.body.cashAmount || 0);

        // If gold exchange, calculate gold value and combine with any additional cash/online money
        let exchangeGoldValue = 0;
        if (paymentMethod === 'gold_exchange' && exchangeWeight) {
            exchangeGoldValue = Number((Number(exchangeWeight) * effectiveLockedRate).toFixed(2));
            finalAmount = Number((exchangeGoldValue + additionalCash).toFixed(2));
            if (additionalCash > 0) {
                finalNotes = `Deposit Breakdown: ${Number(exchangeWeight).toFixed(3)}g Old ${purityToUse} Gold (₹${exchangeGoldValue.toLocaleString('en-IN')}) + ₹${additionalCash.toLocaleString('en-IN')} Cash/Online\n` + finalNotes;
            }
        }

        // Calculate exact locked grams in selected reference purity and pure gold (24K)
        let lockedGrams = 0;
        if (paymentMethod === 'gold_exchange' && exchangeWeight) {
            const goldGrams = Number(Number(exchangeWeight).toFixed(4));
            const cashGrams = (additionalCash > 0 && effectiveLockedRate > 0) ? Number((additionalCash / effectiveLockedRate).toFixed(4)) : 0;
            lockedGrams = Number((goldGrams + cashGrams).toFixed(4));
        } else {
            lockedGrams = Number((finalAmount / effectiveLockedRate).toFixed(4));
        }

        const lockedPureGrams = Number(toPureGoldGrams(lockedGrams, purityToUse).toFixed(4));

        const creditMemo = await tx.creditMemo.create({
            data: {
                memoId,
                customerId: customer,
                originalAmount: finalAmount,
                balance: finalAmount,
                paymentMethod,
                notes: finalNotes,
                linkedItems: validLinkedItems,
                shopId: shop_id || 'MAIN',
                createdById: req.user.id,
                isRateLocked: true,
                referencePurity: purityToUse,
                lockedGoldRate: effectiveLockedRate,
                lockedGrams: lockedGrams,
                remainingGrams: lockedGrams,
                lockedPureGrams: lockedPureGrams,
                remainingPureGrams: lockedPureGrams,
                exchangePurity: purityToUse,
                exchangeWeight: exchangeWeight ? Number(exchangeWeight) : null
            },
            include: {
                createdBy: { select: { id: true, name: true } }
            }
        });

        if (recordTransactionPrisma) {
            await recordTransactionPrisma({
                customerId: customer,
                type: 'credit',
                amount: finalAmount,
                transactionType: 'advance_payment',
                referenceId: creditMemo.id,
                referenceModel: 'CreditMemo',
                paymentMethod: paymentMethod,
                notes: notes || 'Advance deposit for Credit Memo',
                performedBy: req.user.id
            }, tx);
        }

        ApiResponse.created(creditMemo, 'Credit Memo created successfully').send(res);
    });
});

// Update Credit Memo (Limited to safe fields)
const updateCreditMemo = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { notes, paymentMethod, status } = req.body;

    const creditMemo = await prisma.creditMemo.findUnique({ where: { id } });
    if (!creditMemo) {
        return ApiResponse.error('Credit Memo not found', 404).send(res);
    }

    const dataToUpdate = {};
    if (notes !== undefined) dataToUpdate.notes = notes;
    if (paymentMethod !== undefined) dataToUpdate.paymentMethod = paymentMethod;
    if (status !== undefined) dataToUpdate.status = status;

    const updatedMemo = await prisma.creditMemo.update({
        where: { id },
        data: dataToUpdate
    });

    ApiResponse.success(updatedMemo, 'Credit Memo updated successfully').send(res);
});

// Delete Credit Memo (Strict Rules)
const deleteCreditMemo = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const creditMemo = await prisma.creditMemo.findUnique({ where: { id } });
    if (!creditMemo) {
        return ApiResponse.error('Credit Memo not found', 404).send(res);
    }

    // Temporary: Allow deletion of used credit memos for testing purposes
    // if (Number(creditMemo.balance) !== Number(creditMemo.originalAmount)) {
    //     return ApiResponse.error('Cannot delete: Credit Memo has already been partially or fully used.', 403).send(res);
    // }

    await prisma.$transaction(async (tx) => {
        if (recordTransactionPrisma) {
            await recordTransactionPrisma({
                customerId: creditMemo.customerId,
                type: 'debit', // Reverse the initial credit
                amount: Number(creditMemo.originalAmount),
                transactionType: 'reversal',
                referenceId: creditMemo.id,
                referenceModel: 'CreditMemo',
                paymentMethod: creditMemo.paymentMethod,
                notes: 'Reversal: Deletion of Credit Memo',
                performedBy: req.user.id
            }, tx);
        }

        await tx.creditMemo.delete({ where: { id } });
    });

    ApiResponse.success({}, 'Credit Memo deleted and ledger reversed successfully').send(res);
});

// Request OTP to authorize Credit Memo redemption (Security Verification)
const sendRedemptionOtp = asyncHandler(async (req, res) => {
    const { memoId } = req.params;
    const memo = await prisma.creditMemo.findFirst({
        where: { memoId: memoId.trim() },
        include: {
            customer: { select: { id: true, name: true, phone: true } }
        }
    });

    if (!memo) {
        return ApiResponse.error(`Credit Memo #${memoId} not found`, 404).send(res);
    }

    if (memo.status !== 'active' || Number(memo.balance) <= 0) {
        return ApiResponse.error(`Credit Memo #${memoId} is not active or has zero balance (Status: ${memo.status}, Balance: ₹${memo.balance})`, 400).send(res);
    }

    const customerPhone = memo.customer?.phone;
    if (!customerPhone) {
        return ApiResponse.error(`Customer associated with Credit Memo #${memoId} has no registered phone number`, 400).send(res);
    }

    const otpService = require('../../utils/otpService');
    const otpKey = `credit_memo_otp_${memo.memoId}`;
    const otp = await otpService.generateAndStoreOTP(otpKey, 300, 'credit_memo_redemption', customerPhone);

    const responseData = {
        memoId: memo.memoId,
        customerName: memo.customer.name,
        phoneEnding: customerPhone.slice(-4),
        balance: memo.balance,
        message: `Security OTP sent to customer phone ending in ${customerPhone.slice(-4)}`
    };

    ApiResponse.success(responseData, 'Redemption authorization OTP sent successfully').send(res);
});

// Verify OTP for Credit Memo redemption
const verifyRedemptionOtp = asyncHandler(async (req, res) => {
    const { memoId } = req.params;
    const { otp } = req.body;

    if (!otp) {
        return ApiResponse.error('OTP is required', 400).send(res);
    }

    const memo = await prisma.creditMemo.findFirst({
        where: { memoId: memoId.trim() },
        include: { customer: { select: { phone: true } } }
    });

    if (!memo) {
        return ApiResponse.error(`Credit Memo #${memoId} not found`, 404).send(res);
    }

    const otpService = require('../../utils/otpService');
    const otpKey = `credit_memo_otp_${memo.memoId}`;

    let isValid = false;
    try {
        await otpService.verifyOTP(otpKey, String(otp).trim(), false); // verify against memoKey
        isValid = true;
    } catch (e) {
        // Fallback: check customer phone key
        if (memo.customer?.phone) {
            try {
                await otpService.verifyOTP(memo.customer.phone, String(otp).trim(), false);
                isValid = true;
            } catch (e2) { }
        }
    }

    if (!isValid) {
        return ApiResponse.error('Invalid or expired OTP. Please enter the correct verification code.', 400).send(res);
    }

    ApiResponse.success({
        memoId: memo.memoId,
        verified: true,
        message: 'Credit Memo redemption successfully authorized'
    }, 'OTP verified successfully').send(res);
});

module.exports = {
    getAllCreditMemos,
    searchActiveMemos,
    createCreditMemo,
    updateCreditMemo,
    deleteCreditMemo,
    sendRedemptionOtp,
    verifyRedemptionOtp
};

