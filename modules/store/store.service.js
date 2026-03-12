const Store = require('./store.model');

/**
 * Create a new store
 */
const createStore = async (storeData) => {
    return await Store.create(storeData);
};

/**
 * Get all stores
 */
const getAllStores = async (filter = {}) => {
    return await Store.find(filter).populate('manager', 'name email phone');
};

/**
 * Get store by shop_id
 */
const getStoreByShopId = async (shop_id) => {
    return await Store.findOne({ shop_id }).populate('manager', 'name email phone');
};

/**
 * Update store
 */
const updateStore = async (id, updateData) => {
    return await Store.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
};

/**
 * Delete store
 */
const deleteStore = async (id) => {
    return await Store.findByIdAndDelete(id);
};

module.exports = {
    createStore,
    getAllStores,
    getStoreByShopId,
    updateStore,
    deleteStore,
};
