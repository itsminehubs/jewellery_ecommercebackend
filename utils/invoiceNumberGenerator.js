const defaultPrisma = require('../config/prisma');

/**
 * Generates sequential invoice number CS-INV-001, CS-INV-002, etc.
 * Shared across POS Billing Invoices, Gold Bar Sales, Custom Jewelry Orders, and Online E-Commerce Orders.
 */
async function generateInvoiceNumber(tx = defaultPrisma) {
    const [posOrders, orders, goldBars, customOrders] = await Promise.all([
        tx.pOSOrder ? tx.pOSOrder.findMany({
            where: { orderNumber: { startsWith: 'CS-INV-' } },
            select: { orderNumber: true }
        }) : [],
        tx.order ? tx.order.findMany({
            where: { orderNumber: { startsWith: 'CS-INV-' } },
            select: { orderNumber: true }
        }) : [],
        tx.goldBarSale ? tx.goldBarSale.findMany({
            where: { orderNumber: { startsWith: 'CS-INV-' } },
            select: { orderNumber: true }
        }) : [],
        tx.customOrder ? tx.customOrder.findMany({
            where: { orderNumber: { startsWith: 'CS-INV-' } },
            select: { orderNumber: true }
        }) : []
    ]);

    const allInvNumbers = [
        ...posOrders.map(o => o.orderNumber),
        ...orders.map(o => o.orderNumber),
        ...goldBars.map(o => o.orderNumber),
        ...customOrders.map(o => o.orderNumber)
    ];

    let maxNum = 0;
    const regex = /^CS-INV-(\d+)$/;
    for (const numStr of allInvNumbers) {
        const match = regex.exec(numStr);
        if (match) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val) && val > maxNum) {
                maxNum = val;
            }
        }
    }

    let nextNum = maxNum + 1;
    let isUnique = false;
    let candidate = '';

    while (!isUnique) {
        candidate = `CS-INV-${nextNum.toString().padStart(3, '0')}`;
        const [dupPos, dupOrder, dupGold, dupCustom] = await Promise.all([
            tx.pOSOrder ? tx.pOSOrder.findFirst({ where: { orderNumber: candidate }, select: { id: true } }) : null,
            tx.order ? tx.order.findFirst({ where: { orderNumber: candidate }, select: { id: true } }) : null,
            tx.goldBarSale ? tx.goldBarSale.findFirst({ where: { orderNumber: candidate }, select: { id: true } }) : null,
            tx.customOrder ? tx.customOrder.findFirst({ where: { orderNumber: candidate }, select: { id: true } }) : null
        ]);

        if (!dupPos && !dupOrder && !dupGold && !dupCustom) {
            isUnique = true;
        } else {
            nextNum++;
        }
    }

    return candidate;
}

/**
 * Generates sequential credit memo number CS-CM-001, CS-CM-002, etc.
 */
async function generateCreditMemoNumber(tx = defaultPrisma) {
    const existing = await tx.creditMemo.findMany({
        where: { memoId: { startsWith: 'CS-CM-' } },
        select: { memoId: true }
    });

    let maxNum = 0;
    const regex = /^CS-CM-(\d+)$/;
    for (const item of existing) {
        const match = regex.exec(item.memoId);
        if (match) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val) && val > maxNum) {
                maxNum = val;
            }
        }
    }

    let nextNum = maxNum + 1;
    let isUnique = false;
    let candidate = '';

    while (!isUnique) {
        candidate = `CS-CM-${nextNum.toString().padStart(3, '0')}`;
        const exists = await tx.creditMemo.findUnique({ where: { memoId: candidate }, select: { id: true } });
        if (!exists) {
            isUnique = true;
        } else {
            nextNum++;
        }
    }

    return candidate;
}

/**
 * Generates sequential repair receipt voucher CS-REP-001, CS-REP-002, etc.
 */
async function generateRepairVoucherNumber(tx = defaultPrisma) {
    const existing = await tx.repair.findMany({
        where: { receiptVoucher: { startsWith: 'CS-REP-' } },
        select: { receiptVoucher: true }
    });

    let maxNum = 0;
    const regex = /^CS-REP-(\d+)$/;
    for (const item of existing) {
        const match = regex.exec(item.receiptVoucher);
        if (match) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val) && val > maxNum) {
                maxNum = val;
            }
        }
    }

    let nextNum = maxNum + 1;
    let isUnique = false;
    let candidate = '';

    while (!isUnique) {
        candidate = `CS-REP-${nextNum.toString().padStart(3, '0')}`;
        const exists = await tx.repair.findFirst({ where: { receiptVoucher: candidate }, select: { id: true } });
        if (!exists) {
            isUnique = true;
        } else {
            nextNum++;
        }
    }

    return candidate;
}

/**
 * Generates sequential imitation jewellery sales order number CS-IMU-001, CS-IMU-002, etc.
 */
async function generateImitationOrderNumber(tx = defaultPrisma) {
    const existing = await tx.imitationSale.findMany({
        where: { orderNumber: { startsWith: 'CS-IMU-' } },
        select: { orderNumber: true }
    });

    let maxNum = 0;
    const regex = /^CS-IMU-(\d+)$/;
    for (const item of existing) {
        const match = regex.exec(item.orderNumber);
        if (match) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val) && val > maxNum) {
                maxNum = val;
            }
        }
    }

    let nextNum = maxNum + 1;
    let isUnique = false;
    let candidate = '';

    while (!isUnique) {
        candidate = `CS-IMU-${nextNum.toString().padStart(3, '0')}`;
        const exists = await tx.imitationSale.findUnique({ where: { orderNumber: candidate }, select: { id: true } });
        if (!exists) {
            isUnique = true;
        } else {
            nextNum++;
        }
    }

    return candidate;
}

/**
 * Generates sequential scheme invoice number CS-SCH-001, CS-SCH-002, etc.
 */
async function generateSchemeNumber(tx = defaultPrisma) {
    const existing = await tx.scheme.findMany({
        where: { schemeId: { startsWith: 'CS-SCH-' } },
        select: { schemeId: true }
    });

    let maxNum = 0;
    const regex = /^CS-SCH-(\d+)$/;
    for (const item of existing) {
        const match = regex.exec(item.schemeId);
        if (match) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val) && val > maxNum) {
                maxNum = val;
            }
        }
    }

    let nextNum = maxNum + 1;
    let isUnique = false;
    let candidate = '';

    while (!isUnique) {
        candidate = `CS-SCH-${nextNum.toString().padStart(3, '0')}`;
        const exists = await tx.scheme.findUnique({ where: { schemeId: candidate }, select: { id: true } });
        if (!exists) {
            isUnique = true;
        } else {
            nextNum++;
        }
    }

    return candidate;
}

module.exports = {
    generateInvoiceNumber,
    generateCreditMemoNumber,
    generateRepairVoucherNumber,
    generateImitationOrderNumber,
    generateSchemeNumber
};

