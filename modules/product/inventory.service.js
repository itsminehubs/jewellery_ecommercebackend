const Product = require('./product.model');
const AuditLog = require('../audit/audit.model');
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
        session,        // For transactions
        costImpact      // Purchase Price or Cost at time of sale
    } = options;

    const product = await Product.findById(productId).session(session);
    if (!product) throw ApiError.notFound('Product not found');

    const beforeQuantity = product.stock;
    const afterQuantity = beforeQuantity + quantityChange;

    if (afterQuantity < 0) {
        throw ApiError.badRequest(`Insufficient stock for product ${product.sku || product.name}`);
    }

    // 1. Update Product
    product.stock = afterQuantity;
    
    // If it's a purchase, update the purchasePrice/vendor as well
    if (type === 'purchase' && costImpact) {
        // Simple weighted average or last cost logic
        if (product.purchasePrice > 0) {
            const existingValue = beforeQuantity * product.purchasePrice;
            const newValue = quantityChange * costImpact;
            product.purchasePrice = (existingValue + newValue) / afterQuantity;
        } else {
            product.purchasePrice = costImpact;
        }
    }
    
    await product.save({ session });

    // 2. Automate Audit Logging (Reuse Logic)
    await AuditLog.create([{
        type,
        action,
        product: productId,
        beforeQuantity,
        afterQuantity,
        quantityChanged: quantityChange,
        costImpact: costImpact || product.purchasePrice || 0,
        referenceId,
        performedBy,
        notes
    }], { session });

    return product;
};

module.exports = {
    updateStock
};
