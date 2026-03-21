const storeService = require('./store.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const createStore = asyncHandler(async (req, res) => {
    const store = await storeService.createStore(req.body);
    ApiResponse.created(store, 'Store created successfully').send(res);
});

const getAllStores = asyncHandler(async (req, res) => {
    const stores = await storeService.getAllStores();
    ApiResponse.success(stores, 'Stores fetched successfully').send(res);
});

const getStoreByShopId = asyncHandler(async (req, res) => {
    const store = await storeService.getStoreByShopId(req.params.shopId);
    if (!store) {
        return ApiResponse.error('Store not found', 404).send(res);
    }
    ApiResponse.success(store, 'Store fetched successfully').send(res);
});

const updateStore = asyncHandler(async (req, res) => {
    const store = await storeService.updateStore(req.params.id, req.body);
    if (!store) {
        return ApiResponse.error('Store not found', 404).send(res);
    }
    ApiResponse.success(store, 'Store updated successfully').send(res);
});

const deleteStore = asyncHandler(async (req, res) => {
    await storeService.deleteStore(req.params.id);
    ApiResponse.success(null, 'Store deleted successfully').send(res);
});

module.exports = {
    createStore,
    getAllStores,
    getStoreByShopId,
    updateStore,
    deleteStore,
};
