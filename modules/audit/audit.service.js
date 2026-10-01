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
  const rawLogs = await prisma.audit.findMany({
      where: { 
          entityType: 'Product',
          entityId: productId 
      },
      orderBy: { createdAt: 'desc' },
      include: { performedBy: { select: { name: true, role: true } } }
  });
  
  return rawLogs.map(log => {
      const changes = log.changes || {};
      return {
          ...log,
          type: changes.type,
          beforeQuantity: changes.beforeQuantity,
          afterQuantity: changes.afterQuantity,
          quantityChanged: changes.quantityChanged,
          costImpact: changes.costImpact,
          referenceId: changes.referenceId,
          notes: changes.notes
      };
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
  
  const rawLogs = await prisma.audit.findMany({
      where: prismaFilters,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
      include: { 
          performedBy: { select: { name: true, role: true } }
      }
  });
  
  // Frontend expects these directly on the object instead of inside a `changes` JSON field
  const logs = await Promise.all(rawLogs.map(async (log) => {
      let product = null;
      if (log.entityType === 'Product') {
          product = await prisma.product.findUnique({
              where: { id: log.entityId },
              select: { name: true, sku: true }
          });
      }
      
      const changes = log.changes || {};
      
      return {
          ...log,
          product,
          type: changes.type,
          beforeQuantity: changes.beforeQuantity,
          afterQuantity: changes.afterQuantity,
          quantityChanged: changes.quantityChanged,
          costImpact: changes.costImpact,
          referenceId: changes.referenceId,
          notes: changes.notes
      };
  }));
    
  const total = await prisma.audit.count({ where: prismaFilters });
  
  return { logs, total, page, limit };
};

module.exports = {
  logStockChange,
  getProductAudits,
  getGlobalAudits
};
