const prisma = require('../../config/prisma');

/**
 * Record a transaction in the vendor ledger and update vendor balance
 */
const recordTransaction = async (data, tx = null) => {
    const { 
        vendorId, 
        type,           // 'debit' (we pay vendor), 'credit' (we receive stock)
        amount, 
        transactionType, // 'purchase', 'payment', 'return', etc.
        referenceId, 
        paymentMethod,
        notes,
        performedBy 
    } = data;

    const db = tx || prisma;

    // 1. Get current balance from Vendor
    const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new Error('Vendor not found');

    const beforeBalance = vendor.outstandingBalance ? Number(vendor.outstandingBalance) : 0;
    
    // Debit decreases our debt, Credit increases our debt
    const newBalance = type === 'credit' ? (beforeBalance + Number(amount)) : (beforeBalance - Number(amount));

    // 2. Create Ledger Entry
    const ledgerEntry = await db.vendorLedger.create({
        data: {
            vendorId: vendorId,
            type,
            amount: Number(amount),
            runningBalance: newBalance,
            transactionType,
            referenceId,
            // paymentMethod and performedBy may not be present in Prisma VendorLedger.
            // Let's store them in notes if they are not in schema. Schema has notes.
            notes: (notes || '') + (paymentMethod ? ` | Paid via ${paymentMethod}` : '') + (performedBy ? ` | By ${performedBy}` : '')
        }
    });

    // 3. Update Vendor Balance
    await db.vendor.update({
        where: { id: vendorId },
        data: { outstandingBalance: newBalance }
    });

    return ledgerEntry;
};

/**
 * Get vendor statement
 */
const getVendorStatement = async (vendorId, params = {}) => {
    const { startDate, endDate, limit = 50, skip = 0 } = params;
    
    const where = { vendorId };
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
    }

    return await prisma.vendorLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip
    });
};

module.exports = {
    recordTransaction,
    getVendorStatement
};
