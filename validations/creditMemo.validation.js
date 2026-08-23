const Joi = require('joi');

const createCreditMemoSchema = {
    body: Joi.object({
        customer: Joi.string().required().messages({
            'any.required': 'Customer ID is required',
            'string.empty': 'Customer ID cannot be empty'
        }),
        originalAmount: Joi.number().min(1).required().messages({
            'any.required': 'Original amount is required',
            'number.min': 'Original amount must be greater than 0'
        }),
        paymentMethod: Joi.string().valid('cash', 'card', 'upi', 'bank_transfer', 'exchange').required().messages({
            'any.required': 'Payment method is required',
            'any.only': 'Invalid payment method'
        }),
        notes: Joi.string().allow('').optional(),
        linkedItems: Joi.array().items(
            Joi.object({
                product: Joi.string().required().messages({
                    'any.required': 'Product ID is required',
                    'string.empty': 'Product ID cannot be empty'
                }),
                notes: Joi.string().allow('').optional()
            })
        ).optional(),
        shop_id: Joi.string().required().messages({
            'any.required': 'Shop ID is required'
        })
    })
};

module.exports = {
    createCreditMemoSchema
};
