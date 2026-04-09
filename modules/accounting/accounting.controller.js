const cashbookService = require('./cashbook.service');
const expenseService = require('./expense.service');
const ledgerService = require('./customer-ledger.service');
const vendorLedgerService = require('./vendor-ledger.service');
const { asyncHandler } = require('../../middlewares/error.middleware');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * Get Cashbook for a specific shop and date
 */
const getCashbook = asyncHandler(async (req, res) => {
    const date = req.query.date || new Date();
    const cashbook = await cashbookService.getCashbookByDate(req.params.shop_id, date);
    
    if (!cashbook) {
        return ApiResponse.success({ message: 'No entry found for this date' }).send(res);
    }
    
    ApiResponse.success(cashbook).send(res);
});

/**
 * Close the day for a shop
 */
const closeDay = asyncHandler(async (req, res) => {
    const { shop_id, date } = req.body;
    const result = await cashbookService.closeDay(shop_id, date, req.user._id);
    ApiResponse.success(result, 'Day closed successfully').send(res);
});

/**
 * Create a new expense
 */
const createExpense = asyncHandler(async (req, res) => {
    const result = await expenseService.createExpense(req.body, req.user._id);
    ApiResponse.created(result, 'Expense recorded successfully').send(res);
});

/**
 * Get expense analytics
 */
const getExpenseAnalytics = asyncHandler(async (req, res) => {
    const { shop_id, startDate, endDate } = req.query;
    const result = await expenseService.getExpenseAnalytics(shop_id, startDate, endDate);
    ApiResponse.success(result).send(res);
});

/**
 * Get customer statement (Ledger)
 */
const getCustomerStatement = asyncHandler(async (req, res) => {
    const result = await ledgerService.getCustomerStatement(req.params.customerId, req.query);
    ApiResponse.success(result).send(res);
});

/**
 * Get vendor statement (Ledger)
 */
const getVendorStatement = asyncHandler(async (req, res) => {
    const result = await vendorLedgerService.getVendorStatement(req.params.vendorId, req.query);
    ApiResponse.success(result).send(res);
});

/**
 * Record a manual payment (Customer pays bill)
 */
const recordPayment = asyncHandler(async (req, res) => {
    const result = await ledgerService.recordTransaction({
        ...req.body,
        type: 'credit',
        transactionType: 'payment',
        performedBy: req.user._id
    });
    ApiResponse.success(result, 'Payment recorded in ledger').send(res);
});

module.exports = {
    getCashbook,
    closeDay,
    createExpense,
    getExpenseAnalytics,
    getCustomerStatement,
    getVendorStatement,
    recordPayment
};
