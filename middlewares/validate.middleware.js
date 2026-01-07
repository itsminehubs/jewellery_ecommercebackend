const Joi = require('joi');
const ApiError = require('../utils/ApiError');

/**
 * Validation middleware
 * @param {Object} schema - Joi validation schema
 * @returns {Function} Express middleware
 */
const validate = (schema) => {
  return (req, res, next) => {
    const validSchema = {};

    ['params', 'query', 'body'].forEach((key) => {
      if (schema[key]) {
        validSchema[key] = req[key];
      }
    });

    const { value, error } = Joi.compile(schema)
      .prefs({ errors: { label: 'key' }, abortEarly: false })
      .validate(validSchema);

    if (error) {
      const errorMessage = error.details
        .map((details) => details.message)
        .join(', ');
      
      return next(ApiError.badRequest(errorMessage));
    }

    Object.assign(req, value);
    return next();
  };
};

module.exports = validate;
