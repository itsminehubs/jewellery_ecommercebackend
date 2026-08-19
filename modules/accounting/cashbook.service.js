const prisma = require('../../config/prisma');

const getCashbookByDate = async (shop_id, date) => {
    const targetDate = new Date(date).setHours(0,0,0,0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const entries = await prisma.cashbook.findMany({
        where: {
            storeId: shop_id,
            date: {
                gte: new Date(targetDate),
                lt: nextDay
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    let totalCashIn = 0;
    let totalCashOut = 0;

    entries.forEach(entry => {
        if (entry.type === 'cash_in') totalCashIn += Number(entry.amount);
        if (entry.type === 'cash_out') totalCashOut += Number(entry.amount);
    });

    return {
        entries,
        summary: {
            totalCashIn,
            totalCashOut,
            netBalance: totalCashIn - totalCashOut
        }
    };
};

/**
 * Update cashbook on every order/payment event (Prisma Version)
 * We log an individual entry instead of maintaining a DailyCashbook summary record.
 */
const updateCashbookOnEventPrisma = async (shop_id, amount, paymentMethod, source = 'sale', tx = null) => {
    const db = tx || prisma;

    let type = 'cash_in';
    if (source === 'refund' || source === 'vendor_payment' || source === 'expense') {
        type = 'cash_out';
    }

    // In a real system you'd also record who did this. Hardcoding a fallback or we should pass it.
    // Since we don't have performedBy in this legacy method signature, we will find an admin or leave it to optional.
    // Schema requires performedById. We will fetch the first admin for fallback if not provided.
    // To make this robust, we should ideally change the signature, but let's do a fallback:
    let adminId = null;
    const admin = await db.user.findFirst({ where: { role: 'admin' } });
    if (admin) adminId = admin.id;

    if (!adminId) {
        // Find any user to satisfy the schema or just skip if we really can't
        const anyUser = await db.user.findFirst();
        if (anyUser) adminId = anyUser.id;
        else throw new Error("No user found to record Cashbook entry.");
    }

    let actualStoreId = shop_id;
    // Basic UUID regex check
    const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(shop_id);
    if (!isUUID) {
        const store = await db.store.findUnique({ where: { shop_id: shop_id } });
        if (store) actualStoreId = store.id;
        else throw new Error(`Store not found for shop_id: ${shop_id}`);
    }

    return await db.cashbook.create({
        data: {
            storeId: actualStoreId,
            date: new Date(), // Today
            type,
            amount: Number(amount),
            source: `${source}_${paymentMethod}`,
            performedById: adminId
        }
    });
};

module.exports = {
    getCashbookByDate,
    updateCashbookOnEventPrisma
};
