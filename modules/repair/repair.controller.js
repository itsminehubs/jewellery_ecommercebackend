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

    const newRepair = await prisma.repair.create({
        data: {
            receiptVoucher: req.body.receiptVoucher,
            customerId: req.body.customer || req.body.customerId,
            storeId: req.body.storeId || req.body.store,
            billedById: req.body.billedById,
            itemDescription: req.body.itemDescription,
            repairDetails: req.body.repairDetails,
            estimatedCost: req.body.estimatedCost ? Number(req.body.estimatedCost) : 0,
            status: req.body.status || 'received',
            dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null
        }
    });

    res.status(201).json({
        status: 'success',
        data: newRepair
    });
});

exports.getAllRepairs = asyncHandler(async (req, res, next) => {
    const filter = {};
    if (req.headers['x-shop-id'] && req.headers['x-shop-id'] !== 'MAIN') {
        filter.storeId = req.headers['x-shop-id'];
    }
    
    if (req.query.customer) {
        filter.customerId = req.query.customer;
    }

    const repairs = await prisma.repair.findMany({
        where: filter,
        include: {
            customer: { select: { id: true, name: true, phone: true, email: true, addresses: true } },
            store: { select: { id: true, name: true, address: true, phone: true } },
            billedBy: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({
        status: 'success',
        results: repairs.length,
        data: repairs
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

    res.status(200).json({
        status: 'success',
        results: repairs.length,
        data: repairs
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

    res.status(200).json({
        status: 'success',
        data: repair
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
