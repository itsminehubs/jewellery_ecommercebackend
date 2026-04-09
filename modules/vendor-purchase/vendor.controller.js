const vendorService = require('./vendor.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const createVendor = asyncHandler(async (req, res) => {
  const vendor = await vendorService.createVendor(req.body);
  ApiResponse.created(vendor, 'Vendor created successfully').send(res);
});

const getAllVendors = asyncHandler(async (req, res) => {
  const vendors = await vendorService.getAllVendors(req.query);
  ApiResponse.success(vendors, 'Vendors fetched successfully').send(res);
});

const getVendorById = asyncHandler(async (req, res) => {
  const vendor = await vendorService.getVendorById(req.params.id);
  ApiResponse.success(vendor, 'Vendor details fetched').send(res);
});

const updateVendor = asyncHandler(async (req, res) => {
  const vendor = await vendorService.updateVendor(req.params.id, req.body);
  ApiResponse.success(vendor, 'Vendor updated successfully').send(res);
});

const deleteVendor = asyncHandler(async (req, res) => {
  await vendorService.deleteVendor(req.params.id);
  ApiResponse.success(null, 'Vendor deleted successfully').send(res);
});

module.exports = {
  createVendor,
  getAllVendors,
  getVendorById,
  updateVendor,
  deleteVendor
};
