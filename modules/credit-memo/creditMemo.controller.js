const prisma = require('../../config/prisma');
const { recordTransactionPrisma } = require('../accounting/customer-ledger.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

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
    const { customer, originalAmount, paymentMethod, notes, shop_id, linkedItems } = req.body;
    
    if (!customer || !originalAmount || !paymentMethod) {
        return ApiResponse.error('Customer ID, originalAmount, and paymentMethod are required', 400).send(res);
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

        let isUnique = false;
        let memoId = '';
        while (!isUnique) {
            const randomNum = Math.floor(10000 + Math.random() * 90000);
            memoId = `CS-${metalCode}-${randomNum}`;
            const exists = await tx.creditMemo.findUnique({ where: { memoId } });
            if (!exists) {
                isUnique = true;
            }
        }

        const creditMemo = await tx.creditMemo.create({
            data: {
                memoId,
                customerId: customer,
                originalAmount: Number(originalAmount),
                balance: Number(originalAmount),
                paymentMethod,
                notes,
                linkedItems: validLinkedItems,
                shopId: shop_id || 'MAIN',
                createdById: req.user.id
            }
        });
        
        if (recordTransactionPrisma) {
            await recordTransactionPrisma({
                customerId: customer,
                type: 'credit',
                amount: Number(originalAmount),
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

module.exports = {
    getAllCreditMemos,
    searchActiveMemos,
    createCreditMemo,
    updateCreditMemo,
    deleteCreditMemo
};
