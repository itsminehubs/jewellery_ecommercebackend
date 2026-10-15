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

// Create new Credit Memo
const createCreditMemo = asyncHandler(async (req, res) => {
    const { customer, originalAmount, paymentMethod, notes, shop_id, linkedItems, isRateLocked, lockedGoldRate, exchangePurity, exchangeWeight } = req.body;

    if (!customer || !paymentMethod) {
        return ApiResponse.error('Customer ID and paymentMethod are required', 400).send(res);
    }

    let finalAmount = Number(originalAmount) || 0;
    if (paymentMethod === 'gold_exchange' && exchangeWeight && lockedGoldRate && finalAmount === 0) {
        finalAmount = Number(exchangeWeight) * Number(lockedGoldRate);
    }

    if (finalAmount <= 0) {
        return ApiResponse.error('Credit Memo amount must be greater than 0', 400).send(res);
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

        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));

        // Generate Memo ID (Format: CS-CM-001)
        const memoId = await generateCreditMemoNumber(tx);

        let effectiveLockedRate = lockedGoldRate ? Number(lockedGoldRate) : null;
        const purityToUse = exchangePurity || '22K';

        if (!effectiveLockedRate) {
            // Auto fetch current live rate for the purity so it is ALWAYS locked regardless of payment method
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
            }
        }

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
                isRateLocked: true, // Always locked regardless of payment method (Cash, UPI, Card, NEFT, Gold Exchange)
                lockedGoldRate: effectiveLockedRate,
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
            } catch (e2) {}
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

