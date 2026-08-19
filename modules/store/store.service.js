const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');

/**
 * Create a new store
 */
const createStore = async (storeData) => {
    // Generate a shop_id (code) if not provided
    if (!storeData.shop_id && storeData.name && storeData.city) {
        const name = storeData.name || '';
        const address = storeData.address || '';
        const city = storeData.city || '';
        const state = storeData.state || '';
        
        // Example: CarbonSmith-Shop No.7, Shyama Prestige, Pimple Saudagar-Pune-MH
        storeData.shop_id = `${name}-${address}-${city}-${state}`.trim();
    }

    const { manager, ...restData } = storeData;
    
    const managerId = manager && typeof manager === 'object' ? manager.id : manager;

    return await prisma.store.create({
        data: {
            ...restData,
            managerId: managerId || undefined
        },
        include: { manager: { select: { name: true, email: true, phone: true } } }
    });
};

/**
 * Get all stores
 */
const getAllStores = async (filter = {}) => {
    // Prisma filters translation
    const where = {};
    if (filter.status) where.status = filter.status;
    if (filter.city) where.city = filter.city;
    
    return await prisma.store.findMany({
        where,
        include: { manager: { select: { name: true, email: true, phone: true } } }
    });
};

/**
 * Get store by shop_id
 */
const getStoreByShopId = async (shop_id) => {
    return await prisma.store.findUnique({
        where: { shop_id },
        include: { manager: { select: { name: true, email: true, phone: true } } }
    });
};

/**
 * Update store
 */
const updateStore = async (id, updateData) => {
    const { manager, ...restData } = updateData;
    const data = { ...restData };
    if (manager !== undefined) {
        data.managerId = manager && typeof manager === 'object' ? manager.id : (manager || null);
    }

    return await prisma.store.update({
        where: { id },
        data,
        include: { manager: { select: { name: true, email: true, phone: true } } }
    });
};

/**
 * Delete store
 */
const deleteStore = async (id) => {
    return await prisma.store.delete({
        where: { id }
    });
};

module.exports = {
    createStore,
    getAllStores,
    getStoreByShopId,
    updateStore,
    deleteStore,
};
