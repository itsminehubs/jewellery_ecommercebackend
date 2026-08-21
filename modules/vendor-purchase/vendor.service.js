const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const { USER_ROLES } = require('../../utils/constants');

const createVendor = async (vendorData, requesterRole) => {
  // If we had a specific vendorId logic, handle it here. Prisma uses uuid for id.
  // We can let it use uuid.
  
  const existingVendor = await prisma.vendor.findUnique({ where: { phone: vendorData.phone } });
  if (existingVendor) {
    throw ApiError.badRequest('Vendor with this phone number already exists');
  }
  
  if (vendorData.email) {
    const existingEmail = await prisma.vendor.findUnique({ where: { email: vendorData.email } });
    if (existingEmail) {
      throw ApiError.badRequest('Vendor with this email already exists');
    }
  }

  if (vendorData.vendorId) {
    const existingId = await prisma.vendor.findUnique({ where: { vendorId: vendorData.vendorId } });
    if (existingId) {
      throw ApiError.badRequest('Vendor with this Vendor ID already exists (it may be in the deleted/inactive list)');
    }
  }

  try {
    return await prisma.vendor.create({
      data: {
        vendorId: vendorData.vendorId || null,
        name: vendorData.name,
        companyName: vendorData.companyName,
        contactPerson: vendorData.contactPerson || null,
        email: vendorData.email || null,
        phone: vendorData.phone,
        gstNumber: vendorData.gstin || vendorData.gstNumber,
        panNumber: vendorData.panNumber || null,
        category: vendorData.category || null,
        address: vendorData.address,
        isActive: vendorData.isActive !== undefined ? vendorData.isActive : true
      }
    });
  } catch (error) {
    throw error;
  }
};

const getAllVendors = async (filters = {}) => {
  const { page, limit, search, category, ...rest } = filters;

  const where = { isActive: true };
  if (category) where.category = category;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { contactPerson: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } }
    ];
  }

  // If pagination params provided, return paginated result
  if (page && limit) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({ where, orderBy: { name: 'asc' }, skip, take: limitNum }),
      prisma.vendor.count({ where })
    ]);

    return {
      items: vendors.map(v => ({ ...v, gstin: v.gstNumber })),
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum)
    };
  }

  // Legacy: return full list
  const vendors = await prisma.vendor.findMany({ where, orderBy: { name: 'asc' } });
  return vendors.map(vendor => ({ ...vendor, gstin: vendor.gstNumber }));
};

const getVendorById = async (id) => {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) throw ApiError.notFound('Vendor not found');
  
  return {
    ...vendor,
    gstin: vendor.gstNumber
  };
};

const updateVendor = async (id, updateData, requesterRole) => {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) throw ApiError.notFound('Vendor not found');

  if (updateData.phone && updateData.phone !== vendor.phone) {
    const existingVendor = await prisma.vendor.findUnique({ where: { phone: updateData.phone } });
    if (existingVendor) {
      throw ApiError.badRequest('Vendor with this phone number already exists');
    }
  }

  try {
    return await prisma.vendor.update({
      where: { id },
      data: {
        vendorId: updateData.vendorId !== undefined ? updateData.vendorId : undefined,
        name: updateData.name,
        companyName: updateData.companyName,
        contactPerson: updateData.contactPerson !== undefined ? updateData.contactPerson : undefined,
        email: updateData.email,
        phone: updateData.phone,
        gstNumber: updateData.gstin !== undefined ? updateData.gstin : updateData.gstNumber,
        panNumber: updateData.panNumber !== undefined ? updateData.panNumber : undefined,
        category: updateData.category !== undefined ? updateData.category : undefined,
        address: updateData.address,
        isActive: updateData.isActive
      }
    });
  } catch (error) {
    throw error;
  }
};

const deleteVendor = async (id) => {
  // Soft delete
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) throw ApiError.notFound('Vendor not found');

  return await prisma.vendor.update({
    where: { id },
    data: { isActive: false }
  });
};

module.exports = {
  createVendor,
  getAllVendors,
  getVendorById,
  updateVendor,
  deleteVendor
};
