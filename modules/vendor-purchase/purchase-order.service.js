const PurchaseOrder = require('./purchase-order.model');
const inventoryService = require('../product/inventory.service');
const ApiError = require('../../utils/ApiError');
const mongoose = require('mongoose');

const createPurchaseOrder = async (poData, userId) => {
    // Calculate totals for each item
    const items = poData.items.map(item => ({
        ...item,
        totalPrice: item.quantity * item.purchasePrice
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

    return await PurchaseOrder.create({
        ...poData,
        items,
        totalAmount,
        employee: userId
    });
};

const getPurchaseOrders = async (filters = {}) => {
    return await PurchaseOrder.find(filters)
        .populate('vendor', 'name phone')
        .populate('employee', 'name')
        .populate('items.product', 'name sku')
        .sort('-createdAt');
};

const getPurchaseOrderById = async (id) => {
    const po = await PurchaseOrder.findById(id)
        .populate('vendor')
        .populate('employee', 'name')
        .populate('items.product', 'name sku');
    if (!po) throw ApiError.notFound('Purchase Order not found');
    return po;
};

const updatePurchaseOrder = async (id, updateData) => {
    const po = await PurchaseOrder.findById(id);
    if (!po) throw ApiError.notFound('Purchase Order not found');

    if (po.status === 'received' || po.status === 'cancelled') {
        throw ApiError.badRequest(`Cannot update a PO that is already ${po.status}`);
    }

    Object.assign(po, updateData);
    
    // Recalculate totals if items changed
    if (updateData.items) {
        po.items = updateData.items.map(item => ({
            ...item,
            totalPrice: item.quantity * item.purchasePrice
        }));
        po.totalAmount = po.items.reduce((sum, item) => sum + item.totalPrice, 0);
    }

    return await po.save();
};

const vendorLedgerService = require('../accounting/vendor-ledger.service');
const cashbookService = require('../accounting/cashbook.service');
const Product = require('../product/product.model');

/**
 * CORE LOGIC: Receive Purchase Order with ERP & Unique Item Integration
 * @param {string} id - PO ID
 * @param {Object} itemDetails - Map of item index to { huid, tagId, grossWeight, etc }
 * @param {string} userId - Employee ID
 */
const receivePurchaseOrder = async (id, itemDetails, userId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const po = await PurchaseOrder.findById(id).session(session).populate('vendor');
        if (!po) throw ApiError.notFound('Purchase Order not found');

        if (po.status !== 'ordered') {
            throw ApiError.badRequest('Only orders in "ordered" status can be marked as received');
        }

        // 1. Process each item in the PO and Create Unique Products
        for (let i = 0; i < po.items.length; i++) {
            const item = po.items[i];
            const details = itemDetails[i]; // Front-end must send unique details for each piece

            if (!details || !details.huid) {
                throw ApiError.badRequest(`Unique HUID is required for item at index ${i}`);
            }

            // Get base product template if any, or create from scratch
            // In a unique-item ERP, we typically create a NEW product record for every piece
            const baseProduct = await Product.findById(item.product).session(session);
            
            // Create a NEW unique product record
            const uniqueProductData = {
                ...baseProduct.toObject(),
                _id: new mongoose.Types.ObjectId(),
                huid: details.huid,
                tagId: details.tagId || `TAG-${details.huid}`,
                grossWeight: details.grossWeight || baseProduct.grossWeight,
                netWeight: details.netWeight || baseProduct.netWeight,
                stoneWeight: details.stoneWeight || 0,
                purchasePrice: item.purchasePrice,
                stock: 1, // Unique piece
                status: 'active',
                vendor: po.vendor._id,
                shop_id: baseProduct.shop_id
            };
            delete uniqueProductData.sku; // Allow pre-save to gen new SKU or use HUID

            await Product.create([uniqueProductData], { session });
        }

        // 2. Update Vendor Ledger (Udhar to Karigar)
        await vendorLedgerService.recordTransaction({
            vendorId: po.vendor._id,
            type: 'credit', // We owe more money (received stock)
            amount: po.totalAmount,
            transactionType: 'purchase',
            referenceId: po._id,
            notes: `Received Stock via PO ${po.poNumber}`,
            performedBy: userId
        }, session);

        // 3. Mark PO as received
        po.status = 'received';
        po.receivedDate = new Date();
        await po.save({ session });

        await session.commitTransaction();
        return po;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

module.exports = {
    createPurchaseOrder,
    getPurchaseOrders,
    getPurchaseOrderById,
    updatePurchaseOrder,
    receivePurchaseOrder
};
