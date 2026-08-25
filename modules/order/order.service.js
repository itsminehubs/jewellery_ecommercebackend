const { sendEmail } = require('../../jobs/email.job');
const { generateOrderConfirmationEmail } = require('../../utils/emailTemplates');
const prisma = require('../../config/prisma');
const loyaltyService = require('../user/loyalty.service');
const couponService = require('../coupon/coupon.service');
const inventoryService = require('../product/inventory.service');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

const createOrder = async (userId, orderData) => {
    return await prisma.$transaction(async (tx) => {
        if (!orderData.items || orderData.items.length === 0) {
            throw ApiError.badRequest('Order items are required');
        }

        let subtotal = 0;
        let totalTax = 0;
        const orderItemsData = [];

        for (const cartItem of orderData.items) {
            const product = await tx.product.findUnique({ where: { id: cartItem.product } });

            if (!product) {
                throw ApiError.badRequest('Product not found');
            }

            if (product.stock < cartItem.quantity) {
                throw ApiError.badRequest(`${product.name} is out of stock`);
            }

            const price = product.finalPrice ? Number(product.finalPrice) : Number(product.price);
            const itemTotal = price * cartItem.quantity;

            // Using 3% as default GST for jewelry if not on product
            const itemGstRate = product.gstRate || 3;
            const itemTax = itemTotal * (itemGstRate / 100);

            subtotal += itemTotal;
            totalTax += itemTax;

            orderItemsData.push({
                productId: product.id,
                name: product.name,
                image: '', // Can pull from product images if available
                quantity: cartItem.quantity,
                price: price,
                costPrice: product.purchasePrice ? Number(product.purchasePrice) : 0,
                gstRate: itemGstRate,
                taxAmount: itemTax
            });

            await inventoryService.updateStock(product.id, -cartItem.quantity, {
                type: 'sale',
                action: 'ITEM_SOLD',
                performedBy: userId,
                tx,
                notes: 'Online Store Sale'
            });
        }

        let discount = 0;
        if (orderData.couponCode) {
            // Validate and calculate discount
            const coupon = await tx.coupon.findUnique({ where: { code: orderData.couponCode } });
            if (!coupon) throw ApiError.badRequest('Invalid coupon code');

            // Simplified discount calculation for Prisma
            if (coupon.discountType === 'percentage') {
                discount = subtotal * (Number(coupon.discountValue) / 100);
            } else {
                discount = Number(coupon.discountValue);
            }
            if (coupon.maxDiscount && discount > Number(coupon.maxDiscount)) {
                discount = Number(coupon.maxDiscount);
            }

            await tx.coupon.update({
                where: { id: coupon.id },
                data: { usedCount: { increment: 1 } }
            });
        }

        const shippingCost = orderData.shippingCost || 0;
        const total = subtotal + totalTax + shippingCost - discount;

        if (total >= 200000 && !orderData.customerPan) {
            throw ApiError.badRequest('PAN number is required for orders above ₹2,00,000');
        }
        if (orderData.customerPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(orderData.customerPan)) {
            throw ApiError.badRequest('Invalid PAN card format. It should be like ABCDE1234F');
        }

        // Generate Order Number
        const count = await tx.order.count() + 1;
        const orderNumber = `ORD-${new Date().getFullYear()}-${count.toString().padStart(5, '0')}`;

        const order = await tx.order.create({
            data: {
                orderNumber,
                userId: userId,
                customerPan: orderData.customerPan || null,
                customerGst: orderData.customerGst || null,
                orderStatus: 'pending',
                paymentStatus: 'pending',
                paymentMethod: orderData.paymentMethod || 'COD',
                subTotal: subtotal,
                taxTotal: totalTax,
                shippingCost: shippingCost,
                discountTotal: discount,
                grandTotal: total,
                shippingAddressId: typeof orderData.shippingAddress === 'string' ? orderData.shippingAddress : orderData.shippingAddress?.id,
                items: {
                    create: orderItemsData.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        unitPrice: item.price,
                        totalPrice: (item.price * item.quantity) + item.taxAmount
                    }))
                }
            },
            include: { items: true }
        });

        // Clear user cart (assuming cart logic is separate or user model has it, in Prisma it's Cart model usually)
        await tx.cartItem.deleteMany({ where: { userId: userId } });

        logger.info(`Order created: ${order.id}`);

        if (order.paymentMethod === 'COD' || order.paymentMethod === 'cod') {
            try {
                const user = await tx.user.findUnique({ where: { id: userId } });
                const fullOrderForEmail = await tx.order.findUnique({
                    where: { id: order.id },
                    include: { items: { include: { product: true } } }
                });
                
                if (user && user.email) {
                    const emailContent = generateOrderConfirmationEmail(fullOrderForEmail, user);
                    sendEmail({
                        to: user.email,
                        emailType: 'customer',
                        subject: emailContent.subject,
                        text: emailContent.text,
                        html: emailContent.html
                    }).catch(e => logger.error(`Order Confirmation Email error: ${e.message}`));
                }
            } catch (err) {
                logger.error(`Failed to send order email: ${err.message}`);
            }
        }

        return order;
    });
};

const getUserOrders = async (userId, options = {}) => {
    const page = parseInt(options.page, 10) || 1;
    const limit = parseInt(options.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const orders = await prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { items: { include: { product: { include: { images: true } } } } }
    });

    const total = await prisma.order.count({ where: { userId } });

    return { orders, total, page, limit };
};

const getOrderById = async (orderId, userId) => {
    const order = await prisma.order.findFirst({
        where: { id: orderId, userId },
        include: { items: { include: { product: { include: { images: true } } } } }
    });
    if (!order) throw ApiError.notFound('Order not found');
    return order;
};

const updateOrderStatus = async (orderId, status, note = '') => {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw ApiError.notFound('Order not found');

    const updateData = { orderStatus: status };
    if (status === 'DELIVERED' || status === 'delivered') updateData.deliveredAt = new Date();

    const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: updateData
    });

    logger.info(`Order ${orderId} status updated to ${status}`);

    return updatedOrder;
};

const cancelOrder = async (orderId, userId, reason) => {
    return await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
            where: { id: orderId, userId },
            include: { items: true }
        });

        if (!order) throw ApiError.notFound('Order not found');

        if (['SHIPPED', 'shipped', 'DELIVERED', 'delivered'].includes(order.orderStatus)) {
            throw ApiError.badRequest('Cannot cancel shipped or delivered orders');
        }

        const updatedOrder = await tx.order.update({
            where: { id: orderId },
            data: {
                orderStatus: 'cancelled',
                cancelReason: reason
            }
        });

        // Restore stock on cancellation
        for (const item of order.items) {
            await inventoryService.updateStock(item.productId, item.quantity, {
                type: 'refund',
                action: 'ORDER_CANCELLED',
                referenceId: order.id,
                performedBy: userId,
                notes: `Order ${order.id} cancelled by user`,
                tx
            });
        }

        logger.info(`Order cancelled and stock restored: ${orderId}`);

        // Deduct loyalty points on cancellation
        if (loyaltyService.deductPointsPrisma) {
            await loyaltyService.deductPointsPrisma(userId, order.grandTotal, tx);
        }

        return updatedOrder;
    });
};

const deleteOrder = async (orderId, userId) => {
    return await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
            where: { id: orderId, userId },
            include: { items: true }
        });

        if (!order) {
            throw ApiError.notFound('Order not found');
        }

        if (order.paymentStatus === 'PAID' || order.paymentStatus === 'COMPLETED') {
            throw ApiError.badRequest('Paid order cannot be deleted');
        }

        // Restore product stock
        for (const item of order.items) {
            await inventoryService.updateStock(item.productId, item.quantity, {
                type: 'adjustment',
                action: 'PAYMENT_FAILURE_RESTORE',
                referenceId: order.id,
                performedBy: userId,
                notes: 'Payment failed, restoring stock',
                tx
            });
        }

        await tx.order.delete({ where: { id: orderId } });
        logger.info(`Order deleted due to payment failure: ${orderId}`);
    });
};

const verifyPrice = async (items) => {
    let subtotal = 0;
    let totalTax = 0;

    for (const item of items) {
        const product = await prisma.product.findUnique({ where: { id: item.product } });
        if (!product) throw ApiError.notFound('Product not found');

        const price = product.finalPrice ? Number(product.finalPrice) : Number(product.price);
        const itemTotal = price * item.quantity;
        const itemTax = itemTotal * ((product.gstRate || 3) / 100);

        subtotal += itemTotal;
        totalTax += itemTax;
    }

    const shippingCost = subtotal > 2999 ? 0 : 0;
    const total = subtotal + totalTax + shippingCost;

    return { subtotal, tax: totalTax, shippingCost, total };
};

module.exports = {
    createOrder,
    verifyPrice,
    getUserOrders,
    getOrderById,
    updateOrderStatus,
    cancelOrder,
    deleteOrder,
};