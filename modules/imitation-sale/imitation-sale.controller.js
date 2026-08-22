const prisma = require('../../config/prisma');
// trigger nodemon restart

const createImitationSale = async (req, res) => {
  try {
    const { customerId, productName, unitPrice, discount, gstAmount, grandTotal, paymentMode, notes } = req.body;
    const staffId = req.user.id; // From auth middleware

    const productFirstName = productName ? productName.split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, '') : 'ITEM';
    const orderNumber = `CS-IMI-${productFirstName}-${Date.now()}`;

    const sale = await prisma.imitationSale.create({
      data: {
        orderNumber,
        customerId: customerId || null,
        staffId,
        productName,
        unitPrice,
        discount: discount || 0,
        gstAmount: gstAmount || 0,
        grandTotal,
        paymentMode: paymentMode || 'cash',
        notes
      }
    });

    res.status(201).json({ success: true, data: sale, message: 'Imitation sale created successfully' });
  } catch (error) {
    console.error('Error creating imitation sale:', error);
    res.status(500).json({ success: false, message: 'Failed to create imitation sale', error: error.message });
  }
};

const getImitationSales = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', date = '' } = req.query;
    const skip = (page - 1) * limit;

    const where = {};

    // Date filter
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    // Search filter
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const sales = await prisma.imitationSale.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        staff: { select: { id: true, name: true } }
      }
    });

    const total = await prisma.imitationSale.count({ where });

    res.status(200).json({
      success: true,
      data: {
        items: sales,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching imitation sales:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch imitation sales', error: error.message });
  }
};

const getImitationSaleById = async (req, res) => {
  try {
    const { id } = req.params;
    const sale = await prisma.imitationSale.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } }, // limited address to keep it simple
        staff: { select: { id: true, name: true } }
      }
    });

    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });

    res.status(200).json({ success: true, data: sale });
  } catch (error) {
    console.error('Error fetching imitation sale:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch imitation sale', error: error.message });
  }
};

const updateImitationSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const sale = await prisma.imitationSale.update({
      where: { id },
      data: { status, notes }
    });

    res.status(200).json({ success: true, data: sale, message: 'Sale updated successfully' });
  } catch (error) {
    console.error('Error updating imitation sale:', error);
    res.status(500).json({ success: false, message: 'Failed to update imitation sale', error: error.message });
  }
};

const deleteImitationSale = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.imitationSale.delete({ where: { id } });
    res.status(200).json({ success: true, message: 'Sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting imitation sale:', error);
    res.status(500).json({ success: false, message: 'Failed to delete imitation sale', error: error.message });
  }
};

module.exports = {
  createImitationSale,
  getImitationSales,
  getImitationSaleById,
  updateImitationSale,
  deleteImitationSale
};
