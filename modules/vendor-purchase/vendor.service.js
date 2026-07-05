const Vendor = require('./vendor.model');
const ApiError = require('../../utils/ApiError');

const createVendor = async (vendorData, requesterRole) => {
  const { USER_ROLES } = require('../../utils/constants');
  if (requesterRole !== USER_ROLES.SUPER_ADMIN) {
    delete vendorData.vendorId;
  }

  const existingVendor = await Vendor.findOne({ phone: vendorData.phone });
  if (existingVendor) {
    throw ApiError.badRequest('Vendor with this phone number already exists');
  }
  
  try {
    return await Vendor.create(vendorData);
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.vendorId) {
      throw ApiError.badRequest('Vendor ID must be unique');
    }
    throw error;
  }
};

const getAllVendors = async (filters = {}) => {
  return await Vendor.find({ ...filters, isActive: true }).sort('name');
};

const getVendorById = async (id) => {
  const vendor = await Vendor.findById(id);
  if (!vendor) throw ApiError.notFound('Vendor not found');
  return vendor;
};

const updateVendor = async (id, updateData, requesterRole) => {
  const { USER_ROLES } = require('../../utils/constants');
  if (requesterRole !== USER_ROLES.SUPER_ADMIN) {
    delete updateData.vendorId;
  }

  try {
    const vendor = await Vendor.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!vendor) throw ApiError.notFound('Vendor not found');
    return vendor;
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.vendorId) {
      throw ApiError.badRequest('Vendor ID must be unique');
    }
    throw error;
  }
};

const deleteVendor = async (id) => {
  // Soft delete
  const vendor = await Vendor.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!vendor) throw ApiError.notFound('Vendor not found');
  return vendor;
};

module.exports = {
  createVendor,
  getAllVendors,
  getVendorById,
  updateVendor,
  deleteVendor
};
