const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');

/**
 * Centralized Stock Update Service
 * Handles stock changes AND audit logging in a single point of truth.
 */
const updateStock = async (productId, quantityChange, options = {}) => {
    const { 
        type,           // 'purchase', 'sale', 'adjustment', 'refund'
        action,         // 'PO_RECEIVED', 'ITEM_SOLD', etc.
        referenceId,    // PO ID or Order ID
        performedBy,    // User ID
        notes,
        tx,             // For transactions (Prisma uses tx)
        costImpact      // Purchase Price or Cost at time of sale
    } = options;

    const db = tx || prisma;

    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw ApiError.notFound('Product not found');

    const beforeQuantity = product.stock;
    const afterQuantity = beforeQuantity + quantityChange;

    if (afterQuantity < 0) {
        throw ApiError.badRequest(`Insufficient stock for product ${product.sku || product.name}`);
    }

    // Prepare update data
    const updateData = { stock: afterQuantity };

    // If it's a purchase, update the purchasePrice/vendor as well
    if (type === 'purchase' && costImpact) {
        if (Number(product.purchasePrice) > 0) {
            const existingValue = beforeQuantity * Number(product.purchasePrice);
            const newValue = quantityChange * costImpact;
            updateData.purchasePrice = (existingValue + newValue) / afterQuantity;
        } else {
            updateData.purchasePrice = costImpact;
        }
    }
    
    // 1. Update Product
    const updatedProduct = await db.product.update({
        where: { id: productId },
        data: updateData
    });

    // 2. Automate Audit Logging (Reuse Logic)
    if (performedBy) {
        await db.audit.create({
            data: {
                entityType: 'Product',
                entityId: productId,
                action: action || 'UPDATE_STOCK',
                changes: {
                    type,
                    beforeQuantity,
                    afterQuantity,
                    quantityChanged: quantityChange,
                    costImpact: costImpact || Number(product.purchasePrice) || 0,
                    referenceId,
                    notes
                },
                performedById: performedBy
            }
        });
    }

    return updatedProduct;
};

module.exports = {
    updateStock
};
