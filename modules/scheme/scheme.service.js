const prisma = require('../../config/prisma');

const enrollCustomer = async (data) => {
    const totalMonths = data.totalMonths || 11;
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

    const scheme = await prisma.scheme.create({
        data: {
            schemeId,
            shopId: data.shop_id,
            customerId: data.customerId,
            monthlyInstallment: data.monthlyInstallment,
            totalMonths,
            bonusPercentage: data.bonusPercentage || 100,
            maturityDate,
            status: 'active',
            notes: data.notes
        }
    });

    return scheme;
};

const recordInstallment = async (schemeId, paymentData, performedBy) => {
    // In Prisma, we use interactive transactions for this
    return await prisma.$transaction(async (tx) => {
        const scheme = await tx.scheme.findUnique({
            where: { id: schemeId },
            include: { installments: true }
        });

        if (!scheme) throw new Error('Scheme not found');
        if (scheme.status !== 'active') throw new Error(`Cannot pay installment for scheme in ${scheme.status} status`);
        if (scheme.installments.length >= scheme.totalMonths) throw new Error('All installments already paid');

        const amount = Number(paymentData.amount);

        const newInstallment = await tx.schemeInstallment.create({
            data: {
                schemeId: scheme.id,
                amount,
                method: paymentData.method,
                transactionId: paymentData.transactionId,
                notes: paymentData.notes,
                collectedById: performedBy
            }
        });

        const newTotalPaid = Number(scheme.totalPaid) + amount;
        const newInstallmentCount = scheme.installments.length + 1;
        
        let newStatus = scheme.status;
        if (newInstallmentCount >= scheme.totalMonths) {
            newStatus = 'matured';
        }

        const updatedScheme = await tx.scheme.update({
            where: { id: scheme.id },
            data: {
                totalPaid: newTotalPaid,
                status: newStatus
            }
        });

        // Update Cashbook for the store
        if (['cash', 'upi', 'card', 'bank_transfer'].includes(paymentData.method)) {
            // Wait, we need cashbookService. 
            // We'll require it here to avoid circular dependency
            const cashbookService = require('../accounting/cashbook.service');
            // Cashbook service likely needs the tx context if it supports it, 
            // but for now we'll call it. In Mongoose it took `session`.
            // Let's pass `tx` to it.
            if (cashbookService.updateCashbookOnEventPrisma) {
                await cashbookService.updateCashbookOnEventPrisma(
                    scheme.shopId, 
                    amount, 
                    paymentData.method, 
                    'sale', // Using 'sale' type in cashbook to represent inflow
                    tx
                );
            }
        }

        return updatedScheme;
    });
};

const getStoreSchemes = async (shopId, filter = {}) => {
    const where = { shopId, ...filter };

    return await prisma.scheme.findMany({
        where,
        include: {
            customer: { select: { name: true, phone: true, email: true } },
            installments: true
        },
        orderBy: { createdAt: 'desc' }
    });
};

const calculateRedemptionValue = (scheme) => {
    if (scheme.status === 'redeemed' || scheme.status === 'closed') {
        return 0; // Already used
    }
    
    let total = Number(scheme.totalPaid);
    
    // Add bonus if matured
    if (scheme.status === 'matured' || (scheme.installments && scheme.installments.length >= scheme.totalMonths)) {
        const bonus = (Number(scheme.monthlyInstallment) * Number(scheme.bonusPercentage)) / 100;
        total += bonus;
    }
    
    return total;
};

module.exports = {
    enrollCustomer,
    recordInstallment,
    getStoreSchemes,
    calculateRedemptionValue
};
