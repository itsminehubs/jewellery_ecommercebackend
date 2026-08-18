const prisma = require('../../config/prisma');
const { updateCashbookOnEventPrisma } = require('./cashbook.service');

/**
 * Create a new business expense and update cashbook
 */
const createExpense = async (expenseData, userId) => {
    return await prisma.$transaction(async (tx) => {
        const expenseDate = expenseData.date ? new Date(expenseData.date) : new Date();
        
        const expense = await tx.expense.create({
            data: {
                storeId: expenseData.shop_id,
                category: expenseData.category || 'misc',
                amount: Number(expenseData.amount),
                date: expenseDate,
                notes: expenseData.notes,
                performedById: userId
            }
        });

        // Auto-update cashbook for the day
        if (updateCashbookOnEventPrisma) {
            await updateCashbookOnEventPrisma(
                expenseData.shop_id,
                expenseData.amount,
                'cash', // Assumption for expense
                'expense',
                tx
            );
        }

        return expense;
    });
};

/**
 * Get expense summary by category (for analytics)
 */
const getExpenseAnalytics = async (shop_id, startDate, endDate) => {
    const expenses = await prisma.expense.groupBy({
        by: ['category'],
        where: {
            storeId: shop_id,
            date: {
                gte: new Date(startDate),
                lte: new Date(endDate)
            }
        },
        _sum: {
            amount: true
        },
        _count: {
            id: true
        }
    });

    return expenses.map(e => ({
        _id: e.category,
        total: e._sum.amount,
        count: e._count.id
    }));
};

module.exports = {
    createExpense,
    getExpenseAnalytics
};
