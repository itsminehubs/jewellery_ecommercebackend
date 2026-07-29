const mongoose = require('mongoose');
const Scheme = require('./scheme.model');
const cashbookService = require('../accounting/cashbook.service');

const enrollCustomer = async (data) => {
    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + (data.totalMonths || 11));

    const scheme = new Scheme({
        ...data,
        maturityDate
    });

    await scheme.save();
    return scheme;
};

const recordInstallment = async (schemeId, paymentData, performedBy) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const scheme = await Scheme.findById(schemeId).session(session);
        if (!scheme) throw new Error('Scheme not found');
        if (scheme.status !== 'active') throw new Error(`Cannot pay installment for scheme in ${scheme.status} status`);
        if (scheme.installments.length >= scheme.totalMonths) throw new Error('All installments already paid');

        const amount = Number(paymentData.amount);
        
        scheme.installments.push({
            amount,
            method: paymentData.method,
            transactionId: paymentData.transactionId,
            notes: paymentData.notes,
            collectedBy: performedBy
        });
        
        scheme.totalPaid += amount;

        // Update Cashbook for the store
        if (paymentData.method === 'cash' || paymentData.method === 'upi' || paymentData.method === 'card' || paymentData.method === 'bank_transfer') {
             await cashbookService.updateCashbookOnEvent(
                 scheme.shop_id, 
                 amount, 
                 paymentData.method, 
                 'sale', // Using 'sale' type in cashbook to represent inflow
                 session
             );
        }

        await scheme.save({ session });
        await session.commitTransaction();
        return scheme;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

const getStoreSchemes = async (shop_id, filter = {}) => {
    return await Scheme.find({ shop_id, ...filter })
        .populate('customerId', 'name phone email')
        .sort({ createdAt: -1 });
};

const calculateRedemptionValue = (scheme) => {
    if (scheme.status === 'redeemed' || scheme.status === 'closed') {
        return 0; // Already used
    }
    
    let total = scheme.totalPaid;
    
    // Add bonus if matured
    if (scheme.status === 'matured' || scheme.installments.length >= scheme.totalMonths) {
        const bonus = (scheme.monthlyInstallment * scheme.bonusPercentage) / 100;
        total += bonus;
    }
    
    return total;
};

module.exports = {
    enrollCustomer,
    recordInstallment,
    getStoreSchemes,
    calculateRedemptionValue
};
