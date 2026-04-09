const VendorLedger = require('./vendor-ledger.model');
const Vendor = require('../vendor-purchase/vendor.model');
const mongoose = require('mongoose');

/**
 * Record a transaction in the vendor ledger and update vendor balance
 */
const recordTransaction = async (data, session = null) => {
    const { 
        vendorId, 
        type,           // 'debit' (we pay vendor), 'credit' (we receive stock)
        amount, 
        transactionType, // 'purchase', 'payment', 'return', etc.
        referenceId, 
        paymentMethod,
        notes,
        performedBy 
    } = data;

    // 1. Get current balance from Vendor
    const vendor = await Vendor.findById(vendorId).session(session);
    if (!vendor) throw new Error('Vendor not found');

    // We use a simple field for outstanding balance in Vendor as well
    // Let's ensure we add this field to the Vendor model in next step if not present
    const beforeBalance = vendor.outstandingBalance || 0;
    
    // Debit decreases our debt, Credit increases our debt
    const newBalance = type === 'credit' ? (beforeBalance + amount) : (beforeBalance - amount);

    // 2. Create Ledger Entry
    const ledgerEntry = await VendorLedger.create([{
        vendor: vendorId,
        type,
        amount,
        runningBalance: newBalance,
        transactionType,
        referenceId,
        paymentMethod,
        notes,
        performedBy
    }], { session });

    // 3. Update Vendor Balance
    vendor.outstandingBalance = newBalance;
    await vendor.save({ session });

    return ledgerEntry[0];
};

/**
 * Get vendor statement
 */
const getVendorStatement = async (vendorId, params = {}) => {
    const { startDate, endDate, limit = 50, skip = 0 } = params;
    
    const query = { vendor: vendorId };
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    return await VendorLedger.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .populate('performedBy', 'name');
};

module.exports = {
    recordTransaction,
    getVendorStatement
};
