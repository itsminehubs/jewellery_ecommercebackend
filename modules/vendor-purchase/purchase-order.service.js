const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const { generatePDF, amountToWords } = require('../../utils/pdfService');

const createPurchaseOrder = async (poData, userId) => {
    // Calculate totals for each item
    const items = poData.items.map(item => ({
        ...item,
        totalPrice: Number(item.quantity) * Number(item.purchasePrice)
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

    // Generate poNumber if missing
    const finalPoNumber = poData.poNumber || `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return await prisma.purchaseOrder.create({
        data: {
            poNumber: finalPoNumber,
            vendorId: poData.vendorId || poData.vendor,
            status: poData.status || 'pending',
            totalAmount,
            notes: poData.notes,
            // Assuming employee/userId could be added if needed, schema only defines vendorId
            items: {
                create: items.map(item => ({
                    productId: typeof item.product === 'object' ? item.product.id : (item.product || null),
                    itemName: item.itemName || item.name || 'Unknown Item',
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.purchasePrice),
                    totalPrice: Number(item.totalPrice)
                }))
            }
        },
        include: { items: true }
    });
};

const getPurchaseOrders = async (filters = {}) => {
    const where = {};
    if (filters.status) where.status = filters.status;
    if (filters.vendor) where.vendorId = filters.vendor;

    const page = parseInt(filters.page, 10) || 1;
    const limit = parseInt(filters.limit, 10) || 10;
    
    if (filters.page && filters.limit) {
        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            prisma.purchaseOrder.findMany({
                where,
                include: {
                    vendor: { select: { name: true, phone: true } },
                    items: { include: { product: { select: { name: true, sku: true, categoryId: true } } } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.purchaseOrder.count({ where })
        ]);
        return { items, total, page, pages: Math.ceil(total / limit) };
    }

    const items = await prisma.purchaseOrder.findMany({
        where,
        include: {
            vendor: { select: { name: true, phone: true } },
            items: { include: { product: { select: { name: true, sku: true, categoryId: true } } } }
        },
        orderBy: { createdAt: 'desc' }
    });
    return items;
};

const getPurchaseOrderById = async (id) => {
    const po = await prisma.purchaseOrder.findUnique({
        where: { id },
        include: {
            vendor: true,
            items: { include: { product: true } }
        }
    });
    if (!po) throw ApiError.notFound('Purchase Order not found');
    return po;
};

const updatePurchaseOrder = async (id, updateData) => {
    const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) throw ApiError.notFound('Purchase Order not found');

    if (po.status === 'received' || po.status === 'cancelled') {
        throw ApiError.badRequest(`Cannot update a PO that is already ${po.status}`);
    }

    let totalAmount = Number(po.totalAmount);

    return await prisma.$transaction(async (tx) => {
        if (updateData.items) {
            // Delete old items and recreate
            await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
            
            const newItems = updateData.items.map(item => ({
                purchaseOrderId: id,
                productId: typeof item.product === 'object' ? item.product.id : (item.product || null),
                itemName: item.itemName || item.name || 'Unknown Item',
                quantity: Number(item.quantity),
                unitPrice: Number(item.purchasePrice),
                totalPrice: Number(item.quantity) * Number(item.purchasePrice)
            }));

            await tx.purchaseOrderItem.createMany({ data: newItems });
            totalAmount = newItems.reduce((sum, item) => sum + item.totalPrice, 0);
        }

        return await tx.purchaseOrder.update({
            where: { id },
            data: {
                status: updateData.status || po.status,
                notes: updateData.notes !== undefined ? updateData.notes : po.notes,
                totalAmount
            },
            include: { items: true }
        });
    });
};

/**
 * CORE LOGIC: Receive Purchase Order with ERP & Unique Item Integration
 * @param {string} id - PO ID
 * @param {Object} itemDetails - Map of item index to { huid, tagId, grossWeight, etc }
 * @param {string} userId - Employee ID
 */
const receivePurchaseOrder = async (id, itemDetails, userId) => {
    return await prisma.$transaction(async (tx) => {
        const po = await tx.purchaseOrder.findUnique({
            where: { id },
            include: { vendor: true, items: true }
        });
        
        if (!po) throw ApiError.notFound('Purchase Order not found');

        if (po.status !== 'pending' && po.status !== 'approved') {
            throw ApiError.badRequest(`Only orders in pending or approved status can be marked as received. Current: ${po.status}`);
        }

        // 1. Process each item in the PO and Create Unique Products
        for (let i = 0; i < po.items.length; i++) {
            const item = po.items[i];
            const details = itemDetails[i]; // Front-end must send unique details for each piece

            if (!details || !details.huid) {
                throw ApiError.badRequest(`Unique HUID is required for item at index ${i}`);
            }

            let baseProduct = null;
            if (item.productId) {
                baseProduct = await tx.product.findUnique({
                    where: { id: item.productId },
                    include: { metalDetails: true, stoneDetails: true }
                });
            }

            if (!baseProduct) {
                throw ApiError.badRequest(`Base product template required for item index ${i}`);
            }

            const tagId = details.tagId || `TAG-${details.huid}`;

            // Create a NEW unique product record using the template
            const uniqueProduct = await tx.product.create({
                data: {
                    sku: details.huid, // Using HUID as SKU for unique piece
                    tagId: tagId,
                    huid: details.huid,
                    name: baseProduct.name,
                    description: baseProduct.description,
                    categoryId: baseProduct.categoryId,
                    shopId: baseProduct.shopId,
                    vendorId: po.vendorId,
                    price: baseProduct.price,
                    purchasePrice: item.unitPrice,
                    makingCharges: baseProduct.makingCharges,
                    makingChargeType: baseProduct.makingChargeType,
                    stoneCharges: baseProduct.stoneCharges,
                    wastage: baseProduct.wastage,
                    discount: baseProduct.discount,
                    finalPrice: baseProduct.finalPrice,
                    stock: 1, // Unique piece
                    status: 'active'
                }
            });

            if (baseProduct.metalDetails) {
                await tx.productMetal.create({
                    data: {
                        productId: uniqueProduct.id,
                        metalType: baseProduct.metalDetails.metalType,
                        purity: baseProduct.metalDetails.purity,
                        grossWeight: details.grossWeight ? Number(details.grossWeight) : Number(baseProduct.metalDetails.grossWeight),
                        netWeight: details.netWeight ? Number(details.netWeight) : Number(baseProduct.metalDetails.netWeight)
                    }
                });
            }

            if (baseProduct.stoneDetails && baseProduct.stoneDetails.length > 0) {
                const stoneWeight = details.stoneWeight ? Number(details.stoneWeight) : 0;
                // Simplified copying of stone details
                for (const stone of baseProduct.stoneDetails) {
                    await tx.productStone.create({
                        data: {
                            productId: uniqueProduct.id,
                            stoneType: stone.stoneType,
                            synthetic: stone.synthetic,
                            shape: stone.shape,
                            netWeight: stoneWeight || Number(stone.netWeight),
                            color: stone.color,
                            clarity: stone.clarity,
                            carat: stone.carat,
                            cut: stone.cut,
                            certification: stone.certification,
                            rate: stone.rate
                        }
                    });
                }
            }
        }

        // 2. Update Vendor Ledger (Udhar to Karigar)
        // Ensure Ledger record is atomic in the transaction
        const previousLedger = await tx.vendorLedger.findFirst({
            where: { vendorId: po.vendorId },
            orderBy: { createdAt: 'desc' }
        });
        const currentBalance = previousLedger ? Number(previousLedger.runningBalance) : 0;
        const newBalance = currentBalance + Number(po.totalAmount);

        await tx.vendorLedger.create({
            data: {
                vendorId: po.vendorId,
                type: 'credit', // We owe more money (received stock)
                amount: po.totalAmount,
                runningBalance: newBalance,
                transactionType: 'purchase',
                referenceId: po.id,
                notes: `Received Stock via PO ${po.poNumber}`
            }
        });

        // 3. Mark PO as received
        const updatedPo = await tx.purchaseOrder.update({
            where: { id: po.id },
            data: { status: 'received' }
        });

        return updatedPo;
    });
};

const deletePurchaseOrder = async (id) => {
    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw ApiError.notFound('Purchase Order not found');

    if (po.status !== 'pending' && po.status !== 'cancelled') {
        throw ApiError.badRequest(`Cannot delete a Purchase Order that is already ${po.status}`);
    }

    return await prisma.purchaseOrder.delete({ where: { id } });
};

const generatePOPDF = async (po) => {
    const store = await prisma.store.findFirst({ where: { status: 'active' } }) || {
        name: 'Jewellery Store',
        address: 'Main Market',
        city: 'City',
        state: 'State',
        pincode: '000000',
        phone: '0000000000'
    };

    return await generatePDF('purchase-order', {
        po,
        store,
        amountInWords: amountToWords(Number(po.totalAmount))
    });
};

module.exports = {
    createPurchaseOrder,
    getPurchaseOrders,
    getPurchaseOrderById,
    updatePurchaseOrder,
    receivePurchaseOrder,
    deletePurchaseOrder,
    generatePOPDF
};
