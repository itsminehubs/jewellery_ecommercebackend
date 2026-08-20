const prisma = require('../../config/prisma');

const logStockChange = async (data, tx = null) => {
  const db = tx || prisma;
  
  if (!data.performedBy && !data.performedById) {
      console.warn("Audit log skipped: No performedBy provided.");
      return null;
  }
  
  return await db.audit.create({
    data: {
      entityType: 'Product',
      entityId: data.product || data.productId,
      action: data.action || 'UPDATE_STOCK',
      changes: {
        type: data.type,
        beforeQuantity: data.beforeQuantity,
        afterQuantity: data.afterQuantity,
        quantityChanged: data.quantityChanged,
        costImpact: data.costImpact,
        referenceId: data.referenceId,
        notes: data.notes
      },
      performedById: data.performedBy || data.performedById
    }
  });
};

const getProductAudits = async (productId) => {
  return await prisma.audit.findMany({
      where: { 
          entityType: 'Product',
          entityId: productId 
      },
      orderBy: { createdAt: 'desc' },
      include: { performedBy: { select: { name: true } } }
  });
};

const getGlobalAudits = async (filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;
  
  const prismaFilters = {};
  if (filters.productId) {
      prismaFilters.entityType = 'Product';
      prismaFilters.entityId = filters.productId;
  }
  
  const logs = await prisma.audit.findMany({
      where: prismaFilters,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
      include: { 
          performedBy: { select: { name: true } }
      }
  });
    
  const total = await prisma.audit.count({ where: prismaFilters });
  
  return { logs, total, page, limit };
};

module.exports = {
  logStockChange,
  getProductAudits,
  getGlobalAudits
};
