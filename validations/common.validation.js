const Joi = require('joi');

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/).message('Invalid ID format');

const pagination = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string(),
    order: Joi.string().valid('asc', 'desc').default('desc')
  })
};

const address = Joi.object({
  type: Joi.string().valid('home', 'office', 'other').default('home'),
  name: Joi.string().required().trim(),
  phone: Joi.string().pattern(/^[6-9]\d{9}$/).required(),
  addressLine1: Joi.string().required().trim(),
  addressLine2: Joi.string().trim().allow(''),
  city: Joi.string().required().trim(),
  state: Joi.string().required().trim(),
  pincode: Joi.string().pattern(/^[1-9][0-9]{5}$/).required(),
  landmark: Joi.string().trim().allow(''),
  isDefault: Joi.boolean().default(false)
});

module.exports = {
  objectId,
  pagination,
  address
};