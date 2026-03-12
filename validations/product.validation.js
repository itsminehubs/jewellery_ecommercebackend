const Joi = require('joi');
const { METAL_TYPES, PRODUCT_STATUS } = require('../utils/constants');

const createProduct = {
    body: Joi.object({
        name: Joi.string().required().trim().min(3).max(100),
        description: Joi.string().required().min(10).max(2000),
        category: Joi.string().required(),
        metalType: Joi.string().valid(...Object.values(METAL_TYPES)).required(),
        purity: Joi.string().allow('', null),
        weight: Joi.number().required().min(0.001),
        price: Joi.number().required().min(0),
        discount: Joi.number().min(0).max(100).default(0),
        stock: Joi.number().integer().min(0).default(0),
        status: Joi.string().valid(...Object.values(PRODUCT_STATUS)).default(PRODUCT_STATUS.ACTIVE),
        featured: Joi.boolean().default(false),
        trending: Joi.boolean().default(false),
        sku: Joi.string().allow('', null),
        specifications: Joi.object().pattern(Joi.string(), Joi.string()),

        // POS/Jewellery Specific
        grossWeight: Joi.number().required().min(0.001),
        stoneWeight: Joi.number().min(0).default(0),
        netWeight: Joi.number().required().min(0.001),
        makingCharges: Joi.number().min(0).default(0),
        makingChargeType: Joi.string().valid('fixed', 'per_gram').default('per_gram'),
        stoneCharges: Joi.number().min(0).default(0),
        wastage: Joi.number().min(0).default(0),
        shop_id: Joi.string().allow('', null)
    })
};

const updateProduct = {
    body: Joi.object({
        name: Joi.string().trim().min(3).max(100),
        description: Joi.string().min(10).max(2000),
        category: Joi.string(),
        metalType: Joi.string().valid(...Object.values(METAL_TYPES)),
        purity: Joi.string().allow('', null),
        weight: Joi.number().min(0.001),
        price: Joi.number().min(0),
        discount: Joi.number().min(0).max(100),
        stock: Joi.number().integer().min(0),
        status: Joi.string().valid(...Object.values(PRODUCT_STATUS)),
        featured: Joi.boolean(),
        trending: Joi.boolean(),
        specifications: Joi.object().pattern(Joi.string(), Joi.string()),

        // POS/Jewellery Specific
        grossWeight: Joi.number().min(0.001),
        stoneWeight: Joi.number().min(0),
        netWeight: Joi.number().min(0.001),
        makingCharges: Joi.number().min(0),
        makingChargeType: Joi.string().valid('fixed', 'per_gram'),
        stoneCharges: Joi.number().min(0),
        wastage: Joi.number().min(0),
        shop_id: Joi.string().allow('', null)
    }).min(1)
};

const getProducts = {
    query: Joi.object({
        page: Joi.number().integer().min(1),
        limit: Joi.number().integer().min(1).max(100),
        sort: Joi.string(),
        category: Joi.string(),
        metalType: Joi.string().valid(...Object.values(METAL_TYPES)),
        search: Joi.string(),
        sku: Joi.string(),
        minPrice: Joi.number().min(0),
        maxPrice: Joi.number().min(0)
    })
};

module.exports = {
    createProduct,
    updateProduct,
    getProducts
};
