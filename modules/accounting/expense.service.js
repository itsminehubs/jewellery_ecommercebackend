const Expense = require('./expense.model');
const DailyCashbook = require('./cashbook.model');
const mongoose = require('mongoose');

/**
 * Create a new business expense and update cashbook
 */
const createExpense = async (expenseData, userId) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const expense = await Expense.create([{
            ...expenseData,
            performedBy: userId
        }], { session });

        // Auto-update cashbook for the day
        const today = new Date().setHours(0,0,0,0);
        await DailyCashbook.findOneAndUpdate(
            { date: today, shop_id: expenseData.shop_id },
            { $inc: { totalExpenses: expenseData.amount } },
            { upsert: true, session }
        );

        await session.commitTransaction();
        return expense[0];
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Get expense summary by category (for analytics)
 */
const getExpenseAnalytics = async (shop_id, startDate, endDate) => {
    return await Expense.aggregate([
        {
            $match: {
                shop_id,
                date: { $gte: new Date(startDate), $lte: new Date(endDate) }
            }
        },
        {
            $group: {
                _id: "$category",
                total: { $sum: "$amount" },
                count: { $sum: 1 }
            }
        }
    ]);
};

module.exports = {
    createExpense,
    getExpenseAnalytics
};
