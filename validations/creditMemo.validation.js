const Joi = require('joi');

const createCreditMemoSchema = {
    body: Joi.object({
        customer: Joi.string().required().messages({
            'any.required': 'Customer ID is required',
            'string.empty': 'Customer ID cannot be empty'
        }),
        originalAmount: Joi.number().min(0).optional(),
        paymentMethod: Joi.string().valid('cash', 'card', 'upi', 'neft', 'rtgs', 'bank_transfer', 'neft_rtgs', 'exchange', 'gold_exchange').required().messages({
            'any.required': 'Payment method is required',
            'any.only': 'Invalid payment method'
        }),
        utrNumber: Joi.string().allow('', null).optional(),
        isRateLocked: Joi.boolean().optional(),
        lockedGoldRate: Joi.number().min(1).optional(),
        exchangePurity: Joi.string().allow('', null).optional(),
        referencePurity: Joi.string().allow('', null).optional(),
        exchangeWeight: Joi.number().min(0.001).optional(),
        cashAmount: Joi.alternatives().try(Joi.number().min(0), Joi.string().allow('', null)).optional(),
        notes: Joi.string().allow('', null).optional(),
        linkedItems: Joi.array().items(
            Joi.object({
                product: Joi.string().required().messages({
                    'any.required': 'Product ID is required',
                    'string.empty': 'Product ID cannot be empty'
                }),
                notes: Joi.string().allow('', null).optional()
            })
        ).optional(),
        shop_id: Joi.string().required().messages({
            'any.required': 'Shop ID is required'
        })
    }).unknown(true)
};

module.exports = {
    createCreditMemoSchema
};
