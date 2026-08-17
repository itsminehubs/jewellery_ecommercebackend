const Repair = require('./repair.model');
const ApiError = require('../../utils/ApiError');
const { asyncHandler } = require('../../middlewares/error.middleware');

const generateVoucher = async () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const count = await Repair.countDocuments({
        receiptVoucher: { $regex: `^REP-${dateStr}` }
    });
    return `REP-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;
};

exports.createRepair = asyncHandler(async (req, res, next) => {
    req.body.receiptVoucher = await generateVoucher();
    req.body.billedBy = req.user.id;
    
    // In POS, the store is usually passed via headers or body
    if (!req.body.store && req.headers['x-shop-id']) {
        req.body.store = req.headers['x-shop-id'];
    }

    const newRepair = await Repair.create(req.body);

    res.status(201).json({
        status: 'success',
        data: newRepair
    });
});

exports.getAllRepairs = asyncHandler(async (req, res, next) => {
    const filter = {};
    // If shop ID is provided, filter by store
    if (req.headers['x-shop-id'] && req.headers['x-shop-id'] !== 'MAIN') {
        filter.store = req.headers['x-shop-id'];
    }
    
    // Support filtering by customer for the frontend
    if (req.query.customer) {
        filter.customer = req.query.customer;
    }

    const repairs = await Repair.find(filter)
        .populate('customer', 'name phone email address')
        .populate('store', 'name address phone')
        .populate('billedBy', 'name')
        .sort('-createdAt');

    res.status(200).json({
        status: 'success',
        results: repairs.length,
        data: repairs
    });
});

exports.getMyRepairs = asyncHandler(async (req, res, next) => {
    const repairs = await Repair.find({ customer: req.user.id })
        .populate('store', 'name address phone')
        .sort('-createdAt');

    res.status(200).json({
        status: 'success',
        results: repairs.length,
        data: repairs
    });
});

exports.getRepair = asyncHandler(async (req, res, next) => {
    const repair = await Repair.findById(req.params.id)
        .populate('customer', 'name phone email address')
        .populate('store', 'name address phone')
        .populate('billedBy', 'name');

    if (!repair) {
        return next(ApiError.notFound('No repair found with that ID'));
    }

    res.status(200).json({
        status: 'success',
        data: repair
    });
});

exports.updateRepair = asyncHandler(async (req, res, next) => {
    const repair = await Repair.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
    }).populate('customer store billedBy');

    if (!repair) {
        return next(ApiError.notFound('No repair found with that ID'));
    }

    res.status(200).json({
        status: 'success',
        data: repair
    });
});

exports.deleteRepair = asyncHandler(async (req, res, next) => {
    // Only admins should hit this route (handled by middleware in routes)
    const repair = await Repair.findByIdAndDelete(req.params.id);

    if (!repair) {
        return next(ApiError.notFound('No repair found with that ID'));
    }

    res.status(204).json({
        status: 'success',
        data: null
    });
});
