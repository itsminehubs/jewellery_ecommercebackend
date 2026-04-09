const DailyCashbook = require('./cashbook.model');
const mongoose = require('mongoose');

const getCashbookByDate = async (shop_id, date) => {
    const targetDate = new Date(date).setHours(0,0,0,0);
    return await DailyCashbook.findOne({ shop_id, date: targetDate });
};

/**
 * Close the day's books
 */
const closeDay = async (shop_id, date, userId) => {
    const targetDate = new Date(date).setHours(0,0,0,0);
    const cashbook = await DailyCashbook.findOne({ shop_id, date: targetDate });
    
    if (!cashbook) throw new Error('Cashbook entry not found for this date');
    
    if (cashbook.status === 'closed') {
        throw new Error('Day is already closed');
    }

    cashbook.status = 'closed';
    cashbook.verifiedBy = userId;
    await cashbook.save();

    // Automate opening balance for next day
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    await DailyCashbook.findOneAndUpdate(
        { date: nextDay, shop_id },
        { openingBalance: cashbook.closingBalance, closingBalance: cashbook.closingBalance },
        { upsert: true, new: true }
    );

    return cashbook;
};

/**
 * Update cashbook on every order/payment event
 * This is a helper internal method called by other services
 */
const updateCashbookOnEvent = async (shop_id, amount, paymentMethod, type = 'sale', session = null) => {
    const today = new Date().setHours(0,0,0,0);
    
    const update = {};
    if (type === 'sale') {
        if (paymentMethod === 'cash') update.$inc = { totalCashSales: amount };
        else if (paymentMethod === 'upi' || paymentMethod === 'card') update.$inc = { totalOnlineSales: amount };
        else if (paymentMethod === 'credit') update.$inc = { totalCreditSales: amount };
    } else if (type === 'customer_payment') {
        update.$inc = { totalCustomerPayments: amount };
    } else if (type === 'vendor_payment') {
        update.$inc = { totalVendorPayments: amount };
    }

    // Always update closing balance
    // note: Credit sales don't increase cash 'closingBalance' in a traditional cashbook, 
    // but in jewelry ERP we track 'Net Day Value'.
    // For pure Cash-In-Hand, we only inc closingBalance for Cash/Online/Payments.
    if (paymentMethod !== 'credit' || type === 'customer_payment') {
        if (!update.$inc) update.$inc = {};
        update.$inc.closingBalance = amount;
    }

    return await DailyCashbook.findOneAndUpdate(
        { date: today, shop_id },
        update,
        { upsert: true, new: true, session }
    );
};

module.exports = {
    getCashbookByDate,
    closeDay,
    updateCashbookOnEvent
};
