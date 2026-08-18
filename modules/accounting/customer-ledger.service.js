const prisma = require('../../config/prisma');

/**
 * Record a transaction in the customer ledger and update user balance (Prisma Version)
 */
const recordTransactionPrisma = async (data, tx = null) => {
    const { 
        customerId, 
        type,           // 'debit' (customer owes more), 'credit' (customer pays)
        amount, 
        transactionType, // 'sale', 'payment', 'return', etc.
        referenceId, 
        referenceModel, 
        paymentMethod,
        notes,
        performedBy 
    } = data;

    const db = tx || prisma;

    // 1. Get current balance from User
    const user = await db.user.findUnique({ where: { id: customerId } });
    if (!user) throw new Error('Customer not found');

    const beforeBalance = user.outstandingBalance ? Number(user.outstandingBalance) : 0;
    
    // Calculate new balance
    // Debit increases debt, Credit decreases debt
    const newBalance = type === 'debit' ? (beforeBalance + Number(amount)) : (beforeBalance - Number(amount));

    // 2. Create Ledger Entry
    const ledgerEntry = await db.customerLedger.create({
        data: {
            customerId,
            type,
            amount: Number(amount),
            runningBalance: newBalance,
            transactionType,
            referenceId,
            referenceModel,
            paymentMethod,
            notes,
            performedById: performedBy
        }
    });

    // 3. Update User Balance
    const updateData = { outstandingBalance: newBalance };
    if (transactionType === 'payment') {
        updateData.lastPaymentDate = new Date();
    }
    
    await db.user.update({
        where: { id: customerId },
        data: updateData
    });

    return ledgerEntry;
};

/**
 * Get customer statement (history)
 */
const getCustomerStatement = async (customerId, params = {}) => {
    const { startDate, endDate, limit = 50, skip = 0 } = params;
    
    const where = { customerId };
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
    }

    return await prisma.customerLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
        include: { performedBy: { select: { name: true } } }
    });
};

module.exports = {
    recordTransactionPrisma,
    getCustomerStatement
};
