const prisma = require('../../config/prisma');

const creategoldBarSale = async (req, res) => {
  try {
    const { customerId, purity, quantity, netWeight, grossWeight, metalRate, gstAmount, grandTotal, paymentMode, customerPan, notes } = req.body;
    const staffId = req.user.id; // From auth middleware

    if (!customerPan) {
      return res.status(400).json({ success: false, message: 'Customer PAN is mandatory for Gold Bar sales' });
    }

    const orderNumber = `CS-GLD-${Date.now()}`;

    const sale = await prisma.goldBarSale.create({
      data: {
        orderNumber,
        customerId: customerId || null,
        staffId,
        purity,
        quantity: quantity || 1,
        netWeight,
        grossWeight,
        metalRate,
        gstAmount: gstAmount || 0,
        grandTotal,
        paymentMode: paymentMode || 'cash',
        customerPan,
        notes
      }
    });

    res.status(201).json({ success: true, data: sale, message: 'Gold Bar sale created successfully' });
  } catch (error) {
    console.error('Error creating Gold Bar sale:', error);
    res.status(500).json({ success: false, message: 'Failed to create Gold Bar sale', error: error.message });
  }
};

const getgoldBarSales = async (req, res) => {
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
        { customerPan: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const sales = await prisma.goldBarSale.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { include: { addresses: true } },
        staff: { select: { id: true, name: true } }
      }
    });

    const total = await prisma.goldBarSale.count({ where });

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
    console.error('Error fetching Gold Bar sales:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Gold Bar sales', error: error.message });
  }
};

const getgoldBarSaleById = async (req, res) => {
  try {
    const { id } = req.params;
    const sale = await prisma.goldBarSale.findUnique({
      where: { id },
      include: {
        customer: { include: { addresses: true } },
        staff: { select: { id: true, name: true } }
      }
    });

    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });

    res.status(200).json({ success: true, data: sale });
  } catch (error) {
    console.error('Error fetching Gold Bar sale:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Gold Bar sale', error: error.message });
  }
};

const updategoldBarSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const sale = await prisma.goldBarSale.update({
      where: { id },
      data: { status, notes }
    });

    res.status(200).json({ success: true, data: sale, message: 'Sale updated successfully' });
  } catch (error) {
    console.error('Error updating Gold Bar sale:', error);
    res.status(500).json({ success: false, message: 'Failed to update Gold Bar sale', error: error.message });
  }
};

const deletegoldBarSale = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.goldBarSale.delete({ where: { id } });
    res.status(200).json({ success: true, message: 'Sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting Gold Bar sale:', error);
    res.status(500).json({ success: false, message: 'Failed to delete Gold Bar sale', error: error.message });
  }
};

module.exports = {
  creategoldBarSale,
  getgoldBarSales,
  getgoldBarSaleById,
  updategoldBarSale,
  deletegoldBarSale
};
