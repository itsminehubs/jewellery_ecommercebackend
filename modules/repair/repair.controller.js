const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const { asyncHandler } = require('../../middlewares/error.middleware');
const ApiResponse = require('../../utils/ApiResponse');
const { generateRepairVoucherNumber } = require('../../utils/invoiceNumberGenerator');

const generateVoucher = async () => {
    return await generateRepairVoucherNumber(prisma);
};

exports.createRepair = asyncHandler(async (req, res, next) => {
    req.body.receiptVoucher = await generateVoucher();
    req.body.billedById = req.user.id;
    
    if (!req.body.storeId && req.headers['x-shop-id'] && req.headers['x-shop-id'] !== 'MAIN') {
        req.body.storeId = req.headers['x-shop-id'];
    }

    let finalStoreId = req.body.storeId || req.body.store;
    if (finalStoreId && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(finalStoreId)) {
        const store = await prisma.store.findUnique({ where: { shop_id: finalStoreId } });
        if (store) {
            finalStoreId = store.id;
        } else {
            finalStoreId = null; // Prevent foreign key error if shop_id is invalid
        }
    }

    const { items, repairBagNumber, deliveryDate, remarks } = req.body;
    
    const itemDescription = (items && items.length > 0) 
        ? items.map(i => i.article).join(', ') 
        : (req.body.itemDescription || 'Repair Intake');
        
    const repairDetails = JSON.stringify({
        items: items || [],
        repairBagNumber: repairBagNumber || '',
        remarks: remarks || ''
    });

    const newRepair = await prisma.repair.create({
        data: {
            receiptVoucher: req.body.receiptVoucher,
            customerId: req.body.customer || req.body.customerId,
            storeId: finalStoreId,
            billedById: req.body.billedById,
            itemDescription: itemDescription,
            repairDetails: repairDetails,
            estimatedCost: req.body.estimatedCost ? Number(req.body.estimatedCost) : 0,
            status: req.body.status || 'received',
            dueDate: deliveryDate ? new Date(deliveryDate) : (req.body.dueDate ? new Date(req.body.dueDate) : null),
            notes: remarks || req.body.notes || ''
        }
    });

    const formattedRepair = {
        ...newRepair,
        items: items || [],
        repairBagNumber: repairBagNumber || '',
        remarks: remarks || ''
    };

    res.status(201).json({
        status: 'success',
        data: formattedRepair
    });
});

exports.getAllRepairs = asyncHandler(async (req, res, next) => {
    const filter = {};
    if (req.headers['x-shop-id'] && req.headers['x-shop-id'] !== 'MAIN') {
        let shopIdFilter = req.headers['x-shop-id'];
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(shopIdFilter)) {
            const store = await prisma.store.findUnique({ where: { shop_id: shopIdFilter } });
            if (store) shopIdFilter = store.id;
        }
        filter.storeId = shopIdFilter;
    }
    
    if (req.query.customer) {
        filter.customerId = req.query.customer;
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const [repairs, total] = await Promise.all([
        prisma.repair.findMany({
            where: filter,
            include: {
                customer: { select: { id: true, name: true, phone: true, email: true, addresses: true } },
                store: { select: { id: true, name: true, address: true, phone: true } },
                billedBy: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        }),
        prisma.repair.count({ where: filter })
    ]);

    const formattedRepairs = repairs.map(r => {
        let details = {};
        if (r.repairDetails) {
            try { details = JSON.parse(r.repairDetails); } catch(e){}
        }
        return {
            ...r,
            isInternal: Boolean(details.isInternal),
            productId: details.productId,
            productName: details.productName,
            sku: details.sku,
            tagId: details.tagId,
            reason: details.reason,
            sentBy: details.sentBy,
            receivedBy: details.receivedBy,
            isReceived: Boolean(details.isReceived),
            items: details.items || [],
            repairBagNumber: details.repairBagNumber || '',
            remarks: details.remarks || r.notes || ''
        };
    });

    res.status(200).json({
        status: 'success',
        results: formattedRepairs.length,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        },
        data: formattedRepairs
    });
});

exports.getMyRepairs = asyncHandler(async (req, res, next) => {
    const repairs = await prisma.repair.findMany({
        where: { customerId: req.user.id },
        include: {
            store: { select: { id: true, name: true, address: true, phone: true } }
        },
        orderBy: { createdAt: 'desc' }
    });

    const formattedRepairs = repairs.map(r => {
        let details = {};
        if (r.repairDetails) {
            try { details = JSON.parse(r.repairDetails); } catch(e){}
        }
        return {
            ...r,
            isInternal: Boolean(details.isInternal),
            productId: details.productId,
            productName: details.productName,
            sku: details.sku,
            tagId: details.tagId,
            reason: details.reason,
            sentBy: details.sentBy,
            receivedBy: details.receivedBy,
            isReceived: Boolean(details.isReceived),
            items: details.items || [],
            repairBagNumber: details.repairBagNumber || '',
            remarks: details.remarks || r.notes || ''
        };
    });

    res.status(200).json({
        status: 'success',
        results: formattedRepairs.length,
        data: formattedRepairs
    });
});

exports.getRepair = asyncHandler(async (req, res, next) => {
    const repair = await prisma.repair.findUnique({
        where: { id: req.params.id },
        include: {
            customer: { select: { id: true, name: true, phone: true, email: true, addresses: true } },
            store: { select: { id: true, name: true, address: true, phone: true } },
            billedBy: { select: { id: true, name: true } }
        }
    });

    if (!repair) {
        return next(ApiError.notFound('No repair found with that ID'));
    }

    let details = {};
    if (repair.repairDetails) {
        try { details = JSON.parse(repair.repairDetails); } catch(e){}
    }
    
    const formattedRepair = {
        ...repair,
        items: details.items || [],
        repairBagNumber: details.repairBagNumber || '',
        remarks: details.remarks || repair.notes || ''
    };

    res.status(200).json({
        status: 'success',
        data: formattedRepair
    });
});

exports.updateRepair = asyncHandler(async (req, res, next) => {
    const repairExists = await prisma.repair.findUnique({ where: { id: req.params.id } });
    
    if (!repairExists) {
        return next(ApiError.notFound('No repair found with that ID'));
    }

    const updateData = {};
    if (req.body.status) updateData.status = req.body.status;
    if (req.body.itemDescription) updateData.itemDescription = req.body.itemDescription;
    if (req.body.repairDetails) updateData.repairDetails = req.body.repairDetails;
    if (req.body.estimatedCost) updateData.estimatedCost = Number(req.body.estimatedCost);
    if (req.body.dueDate) updateData.dueDate = new Date(req.body.dueDate);

    const repair = await prisma.repair.update({
        where: { id: req.params.id },
        data: updateData,
        include: { customer: true, store: true, billedBy: true }
    });

    res.status(200).json({
        status: 'success',
        data: repair
    });
});

exports.deleteRepair = asyncHandler(async (req, res, next) => {
    const repairExists = await prisma.repair.findUnique({ where: { id: req.params.id } });
    
    if (!repairExists) {
        return next(ApiError.notFound('No repair found with that ID'));
    }

    await prisma.repair.delete({
        where: { id: req.params.id }
    });

    res.status(204).json({
        status: 'success',
        data: null
    });
});

exports.createInternalRepair = asyncHandler(async (req, res, next) => {
    const { productId, reason, notes, estimatedCost } = req.body;
    if (!productId) {
        return next(ApiError.badRequest('Product ID is required for internal stock repair intake.'));
    }
    if (!reason || !reason.trim()) {
        return next(ApiError.badRequest('Repair reason / problem details are required.'));
    }

    const product = await prisma.product.findUnique({
        where: { id: productId },
        include: { metalDetails: true, category: true }
    });

    if (!product) {
        return next(ApiError.notFound('Product not found.'));
    }

    const receiptVoucher = await generateVoucher();
    const sender = {
        id: req.user.id,
        name: req.user.name || 'Staff Member',
        role: req.user.role || 'staff',
        phone: req.user.phone || '',
        sentAt: new Date().toISOString()
    };

    const repairDetails = JSON.stringify({
        isInternal: true,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        tagId: product.tagId,
        metal: product.metalDetails?.metalType || 'Gold',
        purity: product.metalDetails?.purity || '',
        category: product.category?.name || '',
        reason: reason.trim(),
        notes: notes || '',
        sentBy: sender
    });

    // 1. Update Product internalState to IN_REPAIR
    await prisma.product.update({
        where: { id: product.id },
        data: { internalState: 'IN_REPAIR' }
    });

    // 2. Create Repair Record
    const newRepair = await prisma.repair.create({
        data: {
            receiptVoucher,
            customerId: req.user.id,
            storeId: product.shopId || req.user.storeId || null,
            billedById: req.user.id,
            itemDescription: `[Store Stock] ${product.name} (SKU: ${product.sku}) - ${reason.trim()}`,
            repairDetails,
            estimatedCost: estimatedCost ? Number(estimatedCost) : 0,
            status: 'in-progress',
            notes: `Store stock repair: ${reason.trim()}`
        },
        include: {
            customer: { select: { id: true, name: true, phone: true } },
            billedBy: { select: { id: true, name: true } }
        }
    });

    // 3. Log into Audit Trail
    const auditService = require('../audit/audit.service');
    await auditService.logStockChange({
        productId: product.id,
        type: 'repair_out',
        action: 'INTERNAL_REPAIR_SENT',
        beforeQuantity: product.stock,
        afterQuantity: product.stock,
        quantityChanged: 0,
        referenceId: receiptVoucher,
        notes: `Sent to repair by ${sender.name} (${sender.role}): ${reason.trim()}`,
        performedById: req.user.id
    });

    res.status(201).json({
        status: 'success',
        message: 'Internal store stock product successfully sent to repair',
        data: newRepair
    });
});

exports.receiveInternalRepair = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { notes, actualCost } = req.body;

    const repair = await prisma.repair.findUnique({
        where: { id }
    });

    if (!repair) {
        return next(ApiError.notFound('Repair record not found.'));
    }

    let details = {};
    if (repair.repairDetails) {
        try { details = JSON.parse(repair.repairDetails); } catch(e){}
    }

    const productId = details.productId;
    const receiver = {
        id: req.user.id,
        name: req.user.name || 'Staff Member',
        role: req.user.role || 'staff',
        phone: req.user.phone || '',
        receivedAt: new Date().toISOString(),
        notes: notes || ''
    };

    details.receivedBy = receiver;
    details.isReceived = true;

    // 1. If product exists, mark internalState back to AVAILABLE
    if (productId) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (product) {
            await prisma.product.update({
                where: { id: productId },
                data: { internalState: 'AVAILABLE' }
            });

            // Log into Audit Trail
            const auditService = require('../audit/audit.service');
            await auditService.logStockChange({
                productId: product.id,
                type: 'repair_in',
                action: 'INTERNAL_REPAIR_RECEIVED',
                beforeQuantity: product.stock,
                afterQuantity: product.stock,
                quantityChanged: 0,
                referenceId: repair.receiptVoucher,
                notes: `Received back from repair by ${receiver.name} (${receiver.role}). Notes: ${notes || 'Repaired & verified'}`,
                performedById: req.user.id
            });
        }
    }

    // 2. Update Repair record to delivered / received
    const updatedRepair = await prisma.repair.update({
        where: { id },
        data: {
            status: 'delivered',
            repairDetails: JSON.stringify(details),
            actualCost: actualCost != null ? Number(actualCost) : repair.actualCost,
            notes: (repair.notes ? repair.notes + ' | ' : '') + `Received by ${receiver.name} on ${new Date().toLocaleDateString()}`
        },
        include: {
            customer: { select: { id: true, name: true, phone: true } },
            billedBy: { select: { id: true, name: true } }
        }
    });

    res.status(200).json({
        status: 'success',
        message: 'Internal store stock product received back into stock successfully',
        data: updatedRepair
    });
});

exports.receiveProductFromRepair = asyncHandler(async (req, res, next) => {
    const { productId } = req.params;
    const { notes, actualCost } = req.body;

    const repair = await prisma.repair.findFirst({
        where: {
            repairDetails: { contains: productId },
            status: { notIn: ['delivered', 'cancelled'] }
        },
        orderBy: { createdAt: 'desc' }
    });

    const receiver = {
        id: req.user.id,
        name: req.user.name || 'Staff Member',
        role: req.user.role || 'staff',
        phone: req.user.phone || '',
        receivedAt: new Date().toISOString(),
        notes: notes || ''
    };

    // 1. Mark product AVAILABLE
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (product) {
        await prisma.product.update({
            where: { id: productId },
            data: { internalState: 'AVAILABLE' }
        });

        // 2. Log in Audit Trail
        const auditService = require('../audit/audit.service');
        await auditService.logStockChange({
            productId: product.id,
            type: 'repair_in',
            action: 'INTERNAL_REPAIR_RECEIVED',
            beforeQuantity: product.stock,
            afterQuantity: product.stock,
            quantityChanged: 0,
            referenceId: repair?.receiptVoucher || 'INTERNAL_REPAIR',
            notes: `Received back from repair by ${receiver.name} (${receiver.role}). Notes: ${notes || 'Good condition'}`,
            performedById: req.user.id
        });
    }

    // 3. If repair record exists, update it
    let updatedRepair = null;
    if (repair) {
        let details = {};
        if (repair.repairDetails) {
            try { details = JSON.parse(repair.repairDetails); } catch(e){}
        }
        details.receivedBy = receiver;
        details.isReceived = true;

        updatedRepair = await prisma.repair.update({
            where: { id: repair.id },
            data: {
                status: 'delivered',
                repairDetails: JSON.stringify(details),
                actualCost: actualCost != null ? Number(actualCost) : repair.actualCost,
                notes: (repair.notes ? repair.notes + ' | ' : '') + `Received by ${receiver.name} on ${new Date().toLocaleDateString()}`
            }
        });
    }

    res.status(200).json({
        status: 'success',
        message: 'Product received back into stock successfully',
        data: updatedRepair
    });
});
