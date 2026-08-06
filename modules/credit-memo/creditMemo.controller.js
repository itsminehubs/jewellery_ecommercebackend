const CreditMemo = require('./creditMemo.model');
const User = require('../user/user.model');
const Product = require('../product/product.model');
const { recordTransaction } = require('../accounting/customer-ledger.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');
const mongoose = require('mongoose');

// Get all Credit Memos (Admin)
const getAllCreditMemos = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;

    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.search) {
        // First find users matching the search
        const users = await User.find({
            $or: [
                { phone: { $regex: req.query.search, $options: 'i' } },
                { name: { $regex: req.query.search, $options: 'i' } }
            ]
        }).select('_id');
        const userIds = users.map(u => u._id);

        query.$or = [
            { memoId: { $regex: req.query.search, $options: 'i' } },
            { customer: { $in: userIds } }
        ];
    }

    const total = await CreditMemo.countDocuments(query);
    const creditMemos = await CreditMemo.find(query)
        .populate('customer', 'name phone email address gstNumber panNumber')
        .populate({
            path: 'linkedItems.product',
            select: 'name basicDetails metalDetails stoneDetails price'
        })
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .skip(startIndex)
        .limit(limit);

    ApiResponse.paginated(creditMemos, page, limit, total).send(res);
});

// Search active memos for POS
const searchActiveMemos = asyncHandler(async (req, res) => {
    const { term } = req.params;
    
    // Find matching users first
    const users = await User.find({ phone: term }).select('_id');
    const userIds = users.map(u => u._id);

    const memos = await CreditMemo.find({
        $or: [
            { memoId: term },
            { customer: { $in: userIds } }
        ],
        status: { $in: ['active', 'partially_used'] },
        balance: { $gt: 0 }
    }).populate('customer', 'name phone email');

    ApiResponse.success(memos, 'Active Credit Memos found').send(res);
});

// Create new Credit Memo
const createCreditMemo = asyncHandler(async (req, res) => {
    const { customer, originalAmount, paymentMethod, notes, shop_id, linkedItems, totalProductPrice } = req.body;
    
    if (!customer || !originalAmount || !paymentMethod) {
        return ApiResponse.error('Customer ID, originalAmount, and paymentMethod are required', 400).send(res);
    }
    
    // Filter out invalid items where no product ID was provided
    const validLinkedItems = linkedItems ? linkedItems.filter(item => item.product) : [];
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        // Generate CM-ID
        let metalCode = 'GEN';
        if (validLinkedItems && validLinkedItems.length > 0) {
            const firstProduct = await Product.findById(validLinkedItems[0].product);
            if (firstProduct) {
                if (firstProduct.metalDetails && firstProduct.metalDetails.metalType) {
                    metalCode = firstProduct.metalDetails.metalType.toUpperCase();
                } else if (firstProduct.basicDetails && firstProduct.basicDetails.name) {
                    metalCode = firstProduct.basicDetails.name.substring(0, 4).toUpperCase();
                } else if (firstProduct.name) {
                    metalCode = firstProduct.name.substring(0, 4).toUpperCase();
                } else if (firstProduct.category) {
                    metalCode = firstProduct.category.substring(0, 4).toUpperCase();
                }
            }
        }

        let isUnique = false;
        let memoId = '';
        while (!isUnique) {
            const randomNum = Math.floor(10000 + Math.random() * 90000);
            memoId = `CS-${metalCode}-${randomNum}`;
            const exists = await CreditMemo.exists({ memoId });
            if (!exists) {
                isUnique = true;
            }
        }

        const creditMemo = new CreditMemo({
            memoId,
            customer,
            originalAmount,
            balance: originalAmount,
            paymentMethod,
            notes,
            totalProductPrice: totalProductPrice ? Number(totalProductPrice) : 0,
            linkedItems: validLinkedItems,
            shop_id: shop_id || 'MAIN',
            createdBy: req.user._id
        });

        await creditMemo.save({ session });
        
        // Log in Ledger (Credit to customer because they gave an advance)
        await recordTransaction({
            customerId: customer,
            type: 'credit',
            amount: originalAmount,
            transactionType: 'advance_payment',
            referenceId: creditMemo._id,
            referenceModel: 'CreditMemo',
            paymentMethod: paymentMethod,
            notes: notes || 'Advance deposit for Credit Memo',
            performedBy: req.user._id
        }, session);

        await session.commitTransaction();
        session.endSession();
        
        ApiResponse.created(creditMemo, 'Credit Memo created successfully').send(res);
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
});

// Update Credit Memo (Limited to safe fields)
const updateCreditMemo = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { notes, paymentMethod, status } = req.body;

    const creditMemo = await CreditMemo.findById(id);
    if (!creditMemo) {
        return ApiResponse.error('Credit Memo not found', 404).send(res);
    }

    if (notes) creditMemo.notes = notes;
    if (paymentMethod) creditMemo.paymentMethod = paymentMethod;
    if (status) creditMemo.status = status;

    await creditMemo.save();

    ApiResponse.success(creditMemo, 'Credit Memo updated successfully').send(res);
});

// Delete Credit Memo (Strict Rules)
const deleteCreditMemo = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const creditMemo = await CreditMemo.findById(id);
    if (!creditMemo) {
        return ApiResponse.error('Credit Memo not found', 404).send(res);
    }

    if (creditMemo.balance !== creditMemo.originalAmount) {
        return ApiResponse.error('Cannot delete: Credit Memo has already been partially or fully used.', 403).send(res);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Reverse Ledger Transaction
        await recordTransaction({
            customerId: creditMemo.customer,
            type: 'debit', // Reverse the initial credit
            amount: creditMemo.originalAmount,
            transactionType: 'reversal',
            referenceId: creditMemo._id,
            referenceModel: 'CreditMemo',
            paymentMethod: creditMemo.paymentMethod,
            notes: 'Reversal: Deletion of Credit Memo',
            performedBy: req.user._id
        }, session);

        await CreditMemo.findByIdAndDelete(id).session(session);

        await session.commitTransaction();
        session.endSession();

        ApiResponse.success({}, 'Credit Memo deleted and ledger reversed successfully').send(res);
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
});

module.exports = {
    getAllCreditMemos,
    searchActiveMemos,
    createCreditMemo,
    updateCreditMemo,
    deleteCreditMemo
};
