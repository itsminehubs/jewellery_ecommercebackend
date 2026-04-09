const CustomerLedger = require('./customer-ledger.model');
const User = require('../user/user.model');
const mongoose = require('mongoose');

/**
 * Record a transaction in the customer ledger and update user balance
 */
const recordTransaction = async (data, session = null) => {
    const { 
        customerId, 
        type,           // 'debit' (customer owes more), 'credit' (customer pays)
        amount, 
        transactionType, // 'sale', 'payment', 'return', etc.
        referenceId, 
        referenceModel, 
        paymentMethod,
        notes,
        performedBy 
    } = data;

    // 1. Get current balance from User
    const user = await User.findById(customerId).session(session);
    if (!user) throw new Error('Customer not found');

    const beforeBalance = user.outstandingBalance || 0;
    
    // Calculate new balance
    // Debit increases debt, Credit decreases debt
    const newBalance = type === 'debit' ? (beforeBalance + amount) : (beforeBalance - amount);

    // 2. Create Ledger Entry
    const ledgerEntry = await CustomerLedger.create([{
        customer: customerId,
        type,
        amount,
        runningBalance: newBalance,
        transactionType,
        referenceId,
        referenceModel,
        paymentMethod,
        notes,
        performedBy
    }], { session });

    // 3. Update User Balance
    user.outstandingBalance = newBalance;
    if (transactionType === 'payment') {
        user.lastPaymentDate = new Date();
    }
    await user.save({ session });

    return ledgerEntry[0];
};

/**
 * Get customer statement (history)
 */
const getCustomerStatement = async (customerId, params = {}) => {
    const { startDate, endDate, limit = 50, skip = 0 } = params;
    
    const query = { customer: customerId };
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    return await CustomerLedger.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .populate('performedBy', 'name');
};

module.exports = {
    recordTransaction,
    getCustomerStatement
};
