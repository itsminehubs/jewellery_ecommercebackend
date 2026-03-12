const storeService = require('./store.service');

const createStore = async (req, res) => {
    try {
        const store = await storeService.createStore(req.body);
        res.status(201).json({ success: true, data: store });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const getAllStores = async (req, res) => {
    try {
        const stores = await storeService.getAllStores();
        res.status(200).json({ success: true, data: stores });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getStoreByShopId = async (req, res) => {
    try {
        const store = await storeService.getStoreByShopId(req.params.shopId);
        if (!store) return res.status(404).json({ success: false, message: 'Store not found' });
        res.status(200).json({ success: true, data: store });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const updateStore = async (req, res) => {
    try {
        const store = await storeService.updateStore(req.params.id, req.body);
        if (!store) return res.status(404).json({ success: false, message: 'Store not found' });
        res.status(200).json({ success: true, data: store });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const deleteStore = async (req, res) => {
    try {
        await storeService.deleteStore(req.params.id);
        res.status(200).json({ success: true, message: 'Store deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createStore,
    getAllStores,
    getStoreByShopId,
    updateStore,
    deleteStore,
};
