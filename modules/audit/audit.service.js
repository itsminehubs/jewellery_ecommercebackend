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
  
  const prismaFilters = {
    entityType: 'Product'
  };

  if (filters.productId) {
    prismaFilters.entityId = filters.productId;
  }

  // Filter by transaction type (sale, purchase, adjustment, removal, repair_out, repair_in)
  if (filters.type) {
    prismaFilters.changes = {
      path: ['type'],
      equals: filters.type
    };
  }

  // Filter by action string
  if (filters.action) {
    prismaFilters.action = {
      contains: filters.action,
      mode: 'insensitive'
    };
  }

  // Filter by date range
  if (filters.startDate || filters.endDate) {
    prismaFilters.createdAt = {};
    if (filters.startDate) prismaFilters.createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) prismaFilters.createdAt.lte = new Date(filters.endDate);
  }

  // Filter by search term (matches Product name, SKU, tagId, action, notes, referenceId)
  if (filters.search && filters.search.trim()) {
    const term = filters.search.trim();
    const matchingProducts = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { tagId: { contains: term, mode: 'insensitive' } }
        ]
      },
      select: { id: true }
    });
    const productIds = matchingProducts.map(p => p.id);

    prismaFilters.OR = [
      ...(productIds.length > 0 ? [{ entityId: { in: productIds } }] : []),
      { action: { contains: term, mode: 'insensitive' } },
      { changes: { path: ['notes'], string_contains: term } },
      { changes: { path: ['referenceId'], string_contains: term } }
    ];
  }
  
  const [rawLogs, total] = await Promise.all([
    prisma.audit.findMany({
      where: prismaFilters,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
      include: { 
        performedBy: { select: { id: true, name: true, role: true } }
      }
    }),
    prisma.audit.count({ where: prismaFilters })
  ]);
  
  // Frontend expects product details directly on the log item
  const logs = await Promise.all(rawLogs.map(async (log) => {
      let product = null;
      if (log.entityType === 'Product') {
          product = await prisma.product.findUnique({
              where: { id: log.entityId },
              select: { name: true, sku: true, tagId: true }
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
    
  return { logs, total, page: Number(page), limit: Number(limit) };
};

module.exports = {
  logStockChange,
  getProductAudits,
  getGlobalAudits
};
