const prisma = require('../../config/prisma');

/**
 * Calculate Gross Profit across a date range (Prisma Version)
 */
const calculateGrossProfit = async (startDate, endDate) => {
    // 1. Profit from Online Orders
    const onlineOrders = await prisma.order.findMany({
        where: {
            createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
            paymentStatus: 'COMPLETED'
        },
        include: { items: { include: { product: true } } }
    });

    let onlineRevenue = 0;
    let onlineCOGS = 0;
    let onlineCount = 0;

    onlineOrders.forEach(order => {
        order.items.forEach(item => {
            onlineRevenue += Number(item.unitPrice) * item.quantity;
            onlineCOGS += item.product?.purchasePrice ? Number(item.product.purchasePrice) * item.quantity : 0;
            onlineCount += item.quantity;
        });
    });

    // 2. Profit from POS Orders
    const posOrders = await prisma.pOSOrder.findMany({
        where: {
            createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
            status: 'completed'
        },
        include: { items: { include: { product: true } } }
    });

    let posRevenue = 0;
    let posCOGS = 0;
    let posCount = 0;

    posOrders.forEach(order => {
        order.items.forEach(item => {
            posRevenue += Number(item.totalPrice);
            posCOGS += item.product?.purchasePrice ? Number(item.product.purchasePrice) * item.quantity : 0;
            posCount += item.quantity;
        });
    });

    return {
        online: {
            revenue: onlineRevenue,
            cost: onlineCOGS,
            profit: onlineRevenue - onlineCOGS
        },
        pos: {
            revenue: posRevenue,
            cost: posCOGS,
            profit: posRevenue - posCOGS
        },
        unified: {
            totalRevenue: onlineRevenue + posRevenue,
            totalCost: onlineCOGS + posCOGS,
            totalProfit: (onlineRevenue - onlineCOGS) + (posRevenue - posCOGS)
        }
    };
};

/**
 * Calculate current Inventory Value
 */
const calculateInventoryValue = async () => {
    const products = await prisma.product.findMany({
        where: { deletedAt: null },
        select: { stock: true, purchasePrice: true }
    });

    let totalItems = 0;
    let totalValue = 0;

    products.forEach(p => {
        totalItems += p.stock;
        totalValue += p.stock * (p.purchasePrice ? Number(p.purchasePrice) : 0);
    });

    return {
        totalItems,
        totalValue
    };
};

module.exports = {
    calculateGrossProfit,
    calculateInventoryValue
};
