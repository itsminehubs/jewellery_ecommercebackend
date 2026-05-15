const Joi = require('joi');
const { METAL_TYPES, PRODUCT_STATUS } = require('../utils/constants');

const createProduct = {
    body: Joi.object({
        name: Joi.string().required().trim().min(3).max(100),
        description: Joi.string().required().min(10).max(2000),
        category: Joi.string().required(),
        
        // NEW STRUCTURED FIELDS
        metalDetails: Joi.object({
            metalType: Joi.string().valid(...Object.values(METAL_TYPES)).required(),
            metalColor: Joi.string().allow('', null),
            purity: Joi.string().allow('', null),
            grossWeight: Joi.number().required().min(0),
            netWeight: Joi.number().required().min(0),
        }).required(),

        stoneDetails: Joi.array().items(Joi.object({
            stoneType: Joi.string().allow('', null),
            color: Joi.string().allow('', null),
            clarity: Joi.string().allow('', null),
            carat: Joi.string().allow('', null),
            cut: Joi.string().allow('', null),
            certification: Joi.string().allow('', null),
        })).default([]),

        basicDetails: Joi.object({
            gender: Joi.string().allow('', null),
            brand: Joi.string().allow('', null),
            occasion: Joi.string().allow('', null),
        }),

        categoryAttributes: Joi.object().pattern(Joi.string(), Joi.string()),

        // PRICING & STOCK
        price: Joi.number().required().min(0),
        discount: Joi.number().min(0).max(100).default(0),
        stock: Joi.number().integer().min(0).default(0),
        status: Joi.string().valid(...Object.values(PRODUCT_STATUS)).default(PRODUCT_STATUS.ACTIVE),
        featured: Joi.boolean().default(false),
        trending: Joi.boolean().default(false),
        sku: Joi.string().allow('', null),
        specifications: Joi.object().pattern(Joi.string(), Joi.string()),

        // POS/Jewellery Specific (Maintained for legacy/internal logic if needed, but made optional)
        makingCharges: Joi.number().min(0).default(0),
        makingChargeType: Joi.string().valid('fixed', 'per_gram').default('per_gram'),
        stoneCharges: Joi.number().min(0).default(0),
        wastage: Joi.number().min(0).default(0),
        shop_id: Joi.string().allow('', null),

        // Legacy root fields (Making optional to avoid errors during transition)
        metalType: Joi.string().valid(...Object.values(METAL_TYPES)).optional(),
        weight: Joi.number().min(0).optional(),
        grossWeight: Joi.number().min(0).optional(),
        netWeight: Joi.number().min(0).optional(),
        purity: Joi.string().allow('', null).optional()
    })
};

const updateProduct = {
    body: Joi.object({
        name: Joi.string().trim().min(3).max(100),
        description: Joi.string().min(10).max(2000),
        category: Joi.string(),
        
        metalDetails: Joi.object({
            metalType: Joi.string().valid(...Object.values(METAL_TYPES)),
            metalColor: Joi.string().allow('', null),
            purity: Joi.string().allow('', null),
            grossWeight: Joi.number().min(0),
            netWeight: Joi.number().min(0),
        }),

        stoneDetails: Joi.array().items(Joi.object({
            stoneType: Joi.string().allow('', null),
            color: Joi.string().allow('', null),
            clarity: Joi.string().allow('', null),
            carat: Joi.string().allow('', null),
            cut: Joi.string().allow('', null),
            certification: Joi.string().allow('', null),
        })),

        basicDetails: Joi.object({
            gender: Joi.string().allow('', null),
            brand: Joi.string().allow('', null),
            occasion: Joi.string().allow('', null),
        }),

        categoryAttributes: Joi.object().pattern(Joi.string(), Joi.string()),

        price: Joi.number().min(0),
        discount: Joi.number().min(0).max(100),
        stock: Joi.number().integer().min(0),
        status: Joi.string().valid(...Object.values(PRODUCT_STATUS)),
        featured: Joi.boolean(),
        trending: Joi.boolean(),
        specifications: Joi.object().pattern(Joi.string(), Joi.string()),

        makingCharges: Joi.number().min(0),
        makingChargeType: Joi.string().valid('fixed', 'per_gram'),
        stoneCharges: Joi.number().min(0),
        wastage: Joi.number().min(0),
        shop_id: Joi.string().allow('', null),

        // Legacy root fields (Optional)
        metalType: Joi.string().valid(...Object.values(METAL_TYPES)).optional(),
        weight: Joi.number().min(0).optional(),
        grossWeight: Joi.number().min(0).optional(),
        netWeight: Joi.number().min(0).optional(),
        purity: Joi.string().allow('', null).optional()
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
        maxPrice: Joi.number().min(0),
        featured: Joi.boolean(),
        trending: Joi.boolean()
    })
};

module.exports = {
    createProduct,
    updateProduct,
    getProducts
};
