const prisma = require('../../config/prisma');

const logStockChange = async (data, tx = null) => {
  const db = tx || prisma;
  return await db.auditLog.create({
    data: {
      type: data.type,
      action: data.action,
      productId: data.product || data.productId,
      beforeQuantity: data.beforeQuantity,
      afterQuantity: data.afterQuantity,
      quantityChanged: data.quantityChanged,
      costImpact: data.costImpact,
      referenceId: data.referenceId,
      performedById: data.performedBy || data.performedById,
      notes: data.notes
    }
  });
};

const getProductAudits = async (productId) => {
  return await prisma.auditLog.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      include: { performedBy: { select: { name: true } } }
  });
};

const getGlobalAudits = async (filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;
  
  const logs = await prisma.auditLog.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
      include: { 
          product: { select: { name: true, sku: true } },
          performedBy: { select: { name: true } }
      }
  });
    
  const total = await prisma.auditLog.count({ where: filters });
  
  return { logs, total, page, limit };
};

module.exports = {
  logStockChange,
  getProductAudits,
  getGlobalAudits
};
