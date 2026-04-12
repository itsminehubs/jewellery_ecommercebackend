const poService = require('./purchase-order.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const createPO = asyncHandler(async (req, res) => {
    const po = await poService.createPurchaseOrder(req.body, req.user._id);
    ApiResponse.created(po, 'Purchase Order created (Draft)').send(res);
});

const getAllPOs = asyncHandler(async (req, res) => {
    const pos = await poService.getPurchaseOrders(req.query);
    ApiResponse.success(pos, 'Purchase orders fetched').send(res);
});

const getPOById = asyncHandler(async (req, res) => {
    const po = await poService.getPurchaseOrderById(req.params.id);
    ApiResponse.success(po, 'PO details fetched').send(res);
});

const updatePO = asyncHandler(async (req, res) => {
    const po = await poService.updatePurchaseOrder(req.params.id, req.body);
    ApiResponse.success(po, 'PO updated successfully').send(res);
});

const receivePO = asyncHandler(async (req, res) => {
    const po = await poService.receivePurchaseOrder(req.params.id, req.user._id);
    ApiResponse.success(po, 'PO marked as Received. Inventory updated.').send(res);
});

const downloadPO = asyncHandler(async (req, res) => {
    const po = await poService.getPurchaseOrderById(req.params.id);
    const pdfBuffer = await poService.generatePOPDF(po);

    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=PO-${po.poNumber}.pdf`,
        'Content-Length': pdfBuffer.length
    });

    res.send(pdfBuffer);
});

const deletePO = asyncHandler(async (req, res) => {
    await poService.deletePurchaseOrder(req.params.id);
    ApiResponse.success(null, 'Purchase Order deleted successfully').send(res);
});

module.exports = {
    createPO,
    getAllPOs,
    getPOById,
    updatePO,
    receivePO,
    downloadPO,
    deletePO
};
