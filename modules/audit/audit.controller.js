const auditService = require('./audit.service');
const { asyncHandler } = require('../../middlewares/error.middleware');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * Get all audit logs for the whole system (Admin Utility)
 */
const getGlobalAudits = asyncHandler(async (req, res) => {
    const filters = {};
    if (req.query.type) filters.type = req.query.type;
    if (req.query.action) filters.action = req.query.action;
    
    // Date filtering logic
    if (req.query.startDate && req.query.endDate) {
        filters.createdAt = {
            $gte: new Date(req.query.startDate),
            $lte: new Date(req.query.endDate)
        };
    }

    const { page, limit } = req.query;
    const result = await auditService.getGlobalAudits(filters, { page, limit });
    
    ApiResponse.paginated(
        result.logs, 
        result.page, 
        result.limit, 
        result.total, 
        'Global audit logs fetched successfully'
    ).send(res);
});

/**
 * Get audit logs for a specific product
 */
const getProductAudits = asyncHandler(async (req, res) => {
    const logs = await auditService.getProductAudits(req.params.productId);
    ApiResponse.success(logs, 'Product audit trail fetched').send(res);
});

module.exports = {
    getGlobalAudits,
    getProductAudits
};
