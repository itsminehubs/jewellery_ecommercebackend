const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const { asyncHandler } = require('../../middlewares/error.middleware');
const { uploadImage } = require('../../config/s3');
const { sendEmail } = require('../../jobs/email.job');

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

    if (!payload.jewelryType) {
        throw new ApiError(400, 'Jewelry type is required');
    }

    const customOrderData = {
        jewelryType: payload.jewelryType,
        customerId: payload.customerId || req.user.id,
        status: payload.status || 'Draft',
        metalPreferences: payload.metalPreferences || {},
        stonePreferences: payload.stonePreferences || {},
        personalization: payload.personalization || {},
        designPreviewImages: payload.designPreviewImages || [],
        pricingBreakdown: payload.pricingBreakdown || {},
        adminNotes: payload.adminNotes || ''
    };

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

    const { totalMetalCost, totalStoneCost, makingCharges, taxAmount } = customOrderData.pricingBreakdown;
    const calculatedTotal = (Number(totalMetalCost) || 0) + (Number(totalStoneCost) || 0) + (Number(makingCharges) || 0) + (Number(taxAmount) || 0);
    customOrderData.pricingBreakdown.finalTotal = customOrderData.pricingBreakdown.finalTotal || calculatedTotal;

    const year = new Date().getFullYear();
    const lastOrder = await prisma.customOrder.findFirst({
        where: {
            orderNumber: {
                startsWith: `CS-${year}-`
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    let nextNumber = 1;
    if (lastOrder && lastOrder.orderNumber) {
        const parts = lastOrder.orderNumber.split('-');
        if (parts.length === 3) {
            const lastNum = parseInt(parts[2], 10);
            if (!isNaN(lastNum)) {
                nextNumber = lastNum + 1;
            }
        }
    }
    const orderNumber = `CS-${year}-${nextNumber.toString().padStart(5, '0')}`;

    const customOrder = await prisma.customOrder.create({
        data: {
            ...customOrderData,
            orderNumber,
            description: payload.description || `Custom ${payload.jewelryType || 'Jewelry'} Order`,
            estimatedPrice: calculatedTotal || 0
        }
    });

    if (payload.customerEmail) {
        const customerName = payload.customerName || req.user?.name || 'Customer';

        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <a href="https://thecarbonsmith.com" target="_blank">
                        <!-- Replace src with the actual image URL you want to use -->
                        <img src="https://www.thecarbonsmith.com/assets/cslogo3-cIe_cQLB.png" alt="CarbonSmith" style="max-width: 100%; height: auto;" />
                    </a>
                </div>
                
                <div style="text-align: center; margin-bottom: 30px;">
                    <p style="font-size: 16px; font-style: italic; color: #555;">Bespoke. Artisanal. Uniquely Yours.</p>
                </div>
                
                <hr style="border: 0; border-top: 1px solid #ccc; margin: 20px 0;">
                
                <div style="text-align: center; margin-bottom: 30px;">
                    <h2 style="font-size: 18px; letter-spacing: 2px; text-transform: uppercase; color: #111; margin: 0;">YOUR VISION, IN THE HANDS OF OUR ARTISANS</h2>
                    <h3 style="font-size: 16px; font-weight: normal; color: #555; margin-top: 10px;">Custom Design Received</h3>
                </div>
                
                <p>Dear ${customerName},</p>
                
                <p>Thank you for sharing your custom design with us.</p>
                
                <p>We’re pleased to confirm that we’ve received your design and it is now being carefully reviewed by our Master Artisans. Every detail is being thoughtfully assessed to ensure your vision is translated with the craftsmanship and attention it deserves.</p>
                
                <p>We’ll connect with you soon with the next steps.</p>
                
                <p>We truly appreciate your patience and look forward to bringing your vision to life.</p>
                
                <br>
                <p>With warm regards,</p>
                <p><strong>CarbonSmith Team</strong></p>
                <p style="font-style: italic;">Yours' BY DESIGN</p>
            </div>
        `;

        const attachments = [];
        if (customOrderData.personalization && customOrderData.personalization.referenceImage) {
            attachments.push({
                filename: 'custom_design_image.jpg',
                path: customOrderData.personalization.referenceImage
            });
        }

        await sendEmail({
            to: payload.customerEmail,
            cc: 'sales@thecarbonsmith.com, akshay.gondhali@thecarbonsmith.com',
            subject: 'Your Custom Design | Now Being Reviewed',
            html: emailHtml,
            emailType: 'customer', // sends from donotreply
            attachments: attachments
        });
    }

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
    const customOrders = await prisma.customOrder.findMany({
        where: { customerId: req.user.id },
        orderBy: { createdAt: 'desc' }
    });

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
    const customOrder = await prisma.customOrder.findUnique({ where: { id: req.params.id } });

    if (!customOrder) {
        throw new ApiError(404, 'Custom order not found');
    }

    if (customOrder.customerId !== req.user.id && !['admin', 'super_admin', 'store_manager'].includes(req.user.role)) {
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

    if (
        ['admin', 'super_admin', 'store_manager'].includes(req.user.role) ||
        (payload.status === 'Quote_Requested' && customOrder.status === 'Draft')
    ) {
        // keep payload.status
    } else {
        delete payload.status;
    }
    delete payload.user;

    const updateData = { ...payload };

    // Map legacy fields to new Prisma schema fields
    if (updateData.metalDetails) {
        updateData.metalPreferences = updateData.metalDetails;
        delete updateData.metalDetails;
    }
    if (updateData.stoneDetails) {
        updateData.stonePreferences = updateData.stoneDetails;
        delete updateData.stoneDetails;
    }
    if (updateData.sizeDetails) {
        updateData.personalization = { ...(updateData.personalization || {}), sizeDetails: updateData.sizeDetails };
        delete updateData.sizeDetails;
    }

    // Remove MongoDB specific or irrelevant fields
    delete updateData._id;
    delete updateData.__v;
    delete updateData.customerId;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    if (req.file) {
        const imageResult = await uploadImage(req.file.path, 'custom-orders');
        updateData.personalization = {
            ...(customOrder.personalization || {}),
            ...(updateData.personalization || {}),
            referenceImage: imageResult.url
        };
        updateData.designPreviewImages = [
            { url: imageResult.url, public_id: imageResult.public_id }
        ];
    }

    if (updateData.pricingBreakdown) {
        const pb = updateData.pricingBreakdown;
        const totalMetalCost = Number(pb.totalMetalCost) || 0;
        const totalStoneCost = Number(pb.totalStoneCost) || 0;
        const makingCharges = Number(pb.makingCharges) || 0;
        const taxAmount = Number(pb.taxAmount) || 0;
        pb.finalTotal = pb.finalTotal || (totalMetalCost + totalStoneCost + makingCharges + taxAmount);

        // Ensure estimatedPrice is updated as well
        updateData.estimatedPrice = pb.finalTotal;
    }

    const updatedCustomOrder = await prisma.customOrder.update({
        where: { id: req.params.id },
        data: updateData
    });

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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.status) {
        where.status = req.query.status;
    }

    const total = await prisma.customOrder.count({ where });

    const customOrders = await prisma.customOrder.findMany({
        where,
        include: { customer: { select: { name: true, email: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
    });

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
    const customOrder = await prisma.customOrder.findUnique({
        where: { id: req.params.id },
        include: { customer: { select: { id: true, name: true, email: true, phone: true } } }
    });

    if (!customOrder) {
        throw new ApiError(404, 'Custom order not found');
    }

    if (customOrder.customerId !== req.user.id && !['admin', 'super_admin', 'store_manager'].includes(req.user.role)) {
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

    const customOrder = await prisma.customOrder.findUnique({ where: { id: req.params.id } });

    if (!customOrder) {
        throw new ApiError(404, 'Custom order not found');
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (adminNotes) updateData.adminNotes = adminNotes;

    const updatedCustomOrder = await prisma.customOrder.update({
        where: { id: req.params.id },
        data: updateData
    });

    res.status(200).json({
        success: true,
        message: 'Custom order status updated',
        data: updatedCustomOrder
    });
});

/**
 * @desc    Delete custom order
 * @route   DELETE /api/v1/custom-orders/:id
 * @access  Private (User who created it or Admin)
 */
exports.deleteCustomOrder = asyncHandler(async (req, res) => {
    const customOrder = await prisma.customOrder.findUnique({ where: { id: req.params.id } });

    if (!customOrder) {
        throw new ApiError(404, 'Custom order not found');
    }

    if (customOrder.customerId !== req.user.id && !['admin', 'super_admin'].includes(req.user.role)) {
        throw new ApiError(403, 'Not authorized to delete this custom order');
    }

    await prisma.customOrder.delete({ where: { id: req.params.id } });

    res.status(200).json({
        success: true,
        message: 'Custom order deleted successfully'
    });
});

