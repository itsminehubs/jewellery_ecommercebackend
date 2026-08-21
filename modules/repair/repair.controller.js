const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const { asyncHandler } = require('../../middlewares/error.middleware');
const ApiResponse = require('../../utils/ApiResponse');

const generateVoucher = async () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const count = await prisma.repair.count({
        where: {
            receiptVoucher: { startsWith: `REP-${dateStr}` }
        }
    });
    return `REP-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;
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
