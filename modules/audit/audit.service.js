const AuditLog = require('./audit.model');

const logStockChange = async (data) => {
  return await AuditLog.create({
    type: data.type,
    action: data.action,
    product: data.product,
    beforeQuantity: data.beforeQuantity,
    afterQuantity: data.afterQuantity,
    quantityChanged: data.quantityChanged,
    costImpact: data.costImpact,
    referenceId: data.referenceId,
    performedBy: data.performedBy,
    notes: data.notes
  });
};

const getProductAudits = async (productId) => {
  return await AuditLog.find({ product: productId }).sort('-createdAt').populate('performedBy', 'name');
};

const getGlobalAudits = async (filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;
  
  const logs = await AuditLog.find(filters)
    .sort('-createdAt')
    .skip(skip)
    .limit(limit)
    .populate('product', 'name sku')
    .populate('performedBy', 'name');
    
  const total = await AuditLog.countDocuments(filters);
  
  return { logs, total, page, limit };
};

module.exports = {
  logStockChange,
  getProductAudits,
  getGlobalAudits
};
