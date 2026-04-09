const Product = require('../product/product.model');
const cashbookService = require('../accounting/cashbook.service');
const ledgerService = require('../accounting/customer-ledger.service');
const mongoose = require('mongoose');

/**
 * Handle Old Gold Buy-Back (Exchange) valuation and credit creation
 */
const processOldGoldExchange = async (data, userId) => {
    const { 
        customerId, 
        purity,       // '22K', '18K', etc.
        grossWeight, 
        deductionWeight = 0, // Wastage or dust deduction
        currentGoldRate, 
        deductionPercentage = 0, // Profit margin deduction
        shop_id 
    } = data;

    const netWeight = grossWeight - deductionWeight;
    
    // Logic: (Net Weight * Rate) * (1 - Deduction%)
    const baseValue = netWeight * currentGoldRate;
    const finalValue = baseValue * (1 - (deductionPercentage/100));

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Create a "Customer Payment" entry in the ledger (as Credit)
        // This gives the customer money to spend on a new item
        await ledgerService.recordTransaction({
            customerId,
            type: 'credit', // customer gives us gold = they have credit
            amount: finalValue,
            transactionType: 'payment', // Marked as payment via exchange
            paymentMethod: 'exchange',
            notes: `Old Gold Exchange: ${grossWeight}g of ${purity}`,
            performedBy: userId
        }, session);

        // 2. Update Cashbook (Optional: Some shops track Exchange Receipts separately)
        // For now, we update totalCustomerPayments in the cashbook
        await cashbookService.updateCashbookOnEvent(shop_id, finalValue, 'exchange', 'customer_payment', session);

        // 3. (Future) Store this as 'Old Gold Stock' in the inventory
        // For now, we just return the value

        await session.commitTransaction();
        return {
            exchangeValue: finalValue,
            netWeight,
            baseValue
        };
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

module.exports = {
    processOldGoldExchange
};
