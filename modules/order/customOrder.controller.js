const CustomOrder = require('./customOrder.model');
const ApiError = require('../../utils/ApiError');
const { asyncHandler } = require('../../middlewares/error.middleware');
const { uploadImage } = require('../../config/cloudinary');

/**
 * @desc    Create a new Custom Jewelry Draft/Order
 * @route   POST /api/v1/custom-orders
 * @access  Private
 */
exports.createCustomOrder = asyncHandler(async (req, res) => {
    let payload = req.body;
    if (req.body.data) {
        try {
            payload = JSON.parse(req.body.data);
        } catch (e) {
            throw new ApiError(400, 'Invalid JSON data payload');
        }
    }

    // Basic validation
    if (!payload.jewelryType) {
        throw new ApiError(400, 'Jewelry type is required');
    }

    // Assign user from auth token
    const customOrderData = {
        ...payload,
        user: req.user._id,
        status: payload.status || 'Draft'
    };

    // Handle image upload if present
    if (req.file) {
        const imageResult = await uploadImage(req.file.path, 'custom-orders');
        customOrderData.personalization = {
            ...customOrderData.personalization,
            referenceImage: imageResult.url
        };

        // Ensure designPreviewImages has it too
        customOrderData.designPreviewImages = [
            { url: imageResult.url, public_id: imageResult.public_id }
        ];
    }

    // Recalculate or verify the pricing on the backend 
    // (A full robust app would verify metal rates from DB here, but for now we trust the frontend payload or just store what they send)

    if (!customOrderData.pricingBreakdown) {
        customOrderData.pricingBreakdown = {};
    }
    
    const { totalMetalCost, totalStoneCost, makingCharges, taxAmount } = customOrderData.pricingBreakdown;
    const calculatedTotal = (totalMetalCost || 0) + (totalStoneCost || 0) + (makingCharges || 0) + (taxAmount || 0);
    customOrderData.pricingBreakdown.finalTotal = customOrderData.pricingBreakdown.finalTotal || calculatedTotal;

    const customOrder = await CustomOrder.create(customOrderData);

    res.status(201).json({
        success: true,
        message: 'Custom design saved successfully',
        data: customOrder
    });
});

/**
 * @desc    Get user's custom orders
 * @route   GET /api/v1/custom-orders/my-orders
 * @access  Private
 */
exports.getMyCustomOrders = asyncHandler(async (req, res) => {
    const customOrders = await CustomOrder.find({ user: req.user._id })
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        count: customOrders.length,
        data: customOrders
    });
});

/**
 * @desc    Update a Custom Jewelry Draft/Order
 * @route   PUT /api/v1/custom-orders/:id
 * @access  Private
 */
exports.updateCustomOrder = asyncHandler(async (req, res) => {
    const customOrder = await CustomOrder.findById(req.params.id);

    if (!customOrder) {
        throw new ApiError(404, 'Custom order not found');
    }

    // Verify ownership
    if (customOrder.user.toString() !== req.user._id.toString() && !['admin', 'super_admin', 'store_manager'].includes(req.user.role)) {
        throw new ApiError(403, 'Not authorized to update this custom order');
    }

    let payload = req.body;
    if (req.body.data) {
        try {
            payload = JSON.parse(req.body.data);
        } catch (e) {
            throw new ApiError(400, 'Invalid JSON data payload');
        }
    }

    // Allow user to request a quote if it is currently a draft, and allow admins to change status
    if (
        ['admin', 'super_admin', 'store_manager'].includes(req.user.role) || 
        (payload.status === 'Quote_Requested' && customOrder.status === 'Draft')
    ) {
        // keep payload.status
    } else {
        delete payload.status;
    }
    delete payload.user;

    const customOrderData = { ...payload };

    // Handle image upload if present
    if (req.file) {
        const imageResult = await uploadImage(req.file.path, 'custom-orders');
        customOrderData.personalization = {
            ...customOrderData.personalization,
            referenceImage: imageResult.url
        };

        customOrderData.designPreviewImages = [
            { url: imageResult.url, public_id: imageResult.public_id }
        ];
    }

    if (!customOrderData.pricingBreakdown) {
        customOrderData.pricingBreakdown = {};
    }

    const { totalMetalCost, totalStoneCost, makingCharges, taxAmount } = customOrderData.pricingBreakdown;
    const calculatedTotal = (totalMetalCost || 0) + (totalStoneCost || 0) + (makingCharges || 0) + (taxAmount || 0);
    customOrderData.pricingBreakdown.finalTotal = customOrderData.pricingBreakdown.finalTotal || calculatedTotal;

    const updatedCustomOrder = await CustomOrder.findByIdAndUpdate(
        req.params.id,
        customOrderData,
        { new: true, runValidators: true }
    );

    res.status(200).json({
        success: true,
        message: 'Custom design updated successfully',
        data: updatedCustomOrder
    });
});

/**
 * @desc    Get all custom orders (SuperAdmin Panel)
 * @route   GET /api/v1/custom-orders
 * @access  Private/Admin
 */
exports.getAllCustomOrders = asyncHandler(async (req, res) => {
    // Pagination & Filtering
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;

    const query = {};
    if (req.query.status) {
        query.status = req.query.status;
    }

    const total = await CustomOrder.countDocuments(query);

    const customOrders = await CustomOrder.find(query)
        .populate('user', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(startIndex)
        .limit(limit);

    res.status(200).json({
        success: true,
        count: customOrders.length,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        },
        data: customOrders
    });
});

/**
 * @desc    Get custom order by ID
 * @route   GET /api/v1/custom-orders/:id
 * @access  Private (User or Admin)
 */
exports.getCustomOrderById = asyncHandler(async (req, res) => {
    const customOrder = await CustomOrder.findById(req.params.id)
        .populate('user', 'name email phone')
        .populate('category', 'name');

    if (!customOrder) {
        throw new ApiError(404, 'Custom order not found');
    }

    // Verify ownership or admin
    if (customOrder.user._id.toString() !== req.user._id.toString() && !['admin', 'super_admin', 'store_manager'].includes(req.user.role)) {
        throw new ApiError(403, 'Not authorized to access this custom order');
    }

    res.status(200).json({
        success: true,
        data: customOrder
    });
});

/**
 * @desc    Update custom order status (Admin)
 * @route   PUT /api/v1/custom-orders/:id/status
 * @access  Private/Admin
 */
exports.updateCustomOrderStatus = asyncHandler(async (req, res) => {
    const { status, adminNotes } = req.body;

    const customOrder = await CustomOrder.findById(req.params.id);

    if (!customOrder) {
        throw new ApiError(404, 'Custom order not found');
    }

    if (status) customOrder.status = status;
    if (adminNotes) customOrder.adminNotes = adminNotes;

    await customOrder.save();

    res.status(200).json({
        success: true,
        message: 'Custom order status updated',
        data: customOrder
    });
});

/**
 * @desc    Delete custom order
 * @route   DELETE /api/v1/custom-orders/:id
 * @access  Private (User who created it or Admin)
 */
exports.deleteCustomOrder = asyncHandler(async (req, res) => {
    const customOrder = await CustomOrder.findById(req.params.id);

    if (!customOrder) {
        throw new ApiError(404, 'Custom order not found');
    }

    // Verify ownership or admin
    if (customOrder.user.toString() !== req.user._id.toString() && !['admin', 'super_admin', 'store_manager'].includes(req.user.role)) {
        throw new ApiError(403, 'Not authorized to delete this custom order');
    }

    await customOrder.deleteOne();

    res.status(200).json({
        success: true,
        message: 'Custom order deleted successfully'
    });
});
