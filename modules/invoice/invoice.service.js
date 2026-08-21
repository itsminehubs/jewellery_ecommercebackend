const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const { generatePDF, amountToWords } = require('../../utils/pdfService');
const { sendEmail } = require('../../jobs/email.job');
const { generateInvoiceEmail } = require('../../utils/emailTemplates');

const generateInvoice = async (orderId, adminId) => {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: true, items: { include: { product: true } } }
    });

    if (!order) throw ApiError.notFound('Order not found');

    const invoiceNumber = `INV-${Date.now()}`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const invoice = await prisma.invoice.create({
        data: {
            orderId: order.id,
            invoiceNumber,
            date: new Date(),
            dueDate,
            // Schema expects JSON items or we could rely on relations. Prisma schema uses JSON for items?
            // Actually, Prisma schema for Invoice might not have an items field, it links to Order.
            // Let's check if there is an items field. If not, we don't save it and just use the relation.
            // Based on Prisma schema:
            // model Invoice {
            //   id        String   @id @default(uuid())
            //   orderId   String   @unique
            //   userId    String
            //   invoiceNumber String @unique
            //   issueDate DateTime @default(now())
            //   dueDate   DateTime
            //   subTotal  Decimal  @db.Decimal(20, 2)
            //   taxTotal  Decimal  @db.Decimal(20, 2)
            //   grandTotal Decimal @db.Decimal(20, 2)
            //   status    String   @default("GENERATED")
            // }
        }
    });

    logger.info(`Invoice generated: ${invoice.invoiceNumber}`);

    // Dispatch Email to Customer
    if (order.user && order.user.email) {
        try {
            const emailContent = generateInvoiceEmail(invoice, order, order.user);
            await sendEmail({
                to: order.user.email,
                emailType: 'customer',
                subject: emailContent.subject,
                text: emailContent.text,
                html: emailContent.html
            });
        } catch (err) {
            logger.error(`Failed to queue invoice email for ${order.user.email}: ${err.message}`);
        }
    }

    return { invoice, message: 'Invoice generated successfully' };
};

const downloadInvoice = async (invoiceId) => {
    // We need to fetch current gold rates if possible, or pass null
    const goldRates = await prisma.goldRate.findFirst({ orderBy: { createdAt: 'desc' } }) || {};

    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { order: { include: { user: true, items: { include: { product: true } } } } }
    });

    if (!invoice) throw ApiError.notFound('Invoice not found');

    const order = invoice.order;
    if (!order) throw ApiError.notFound('Order not found');

    const store = await prisma.store.findFirst({ where: { status: 'active' } }) || {
        name: 'Jewellery Store',
        address: 'Main Market',
        city: 'City',
        state: 'State',
        pincode: '000000',
        phone: '0000000000'
    };

    const shippingAddress = order.shippingAddress || {};

    const pdfBuffer = await generatePDF('invoice', {
        invoice,
        order,
        store,
        shippingAddress,
        goldRates,
        amountInWords: amountToWords(Number(order.grandTotal || order.subTotal || 0)),
        adminName: 'Admin'
    });

    return {
        buffer: pdfBuffer,
        fileName: `INV-${invoice.invoiceNumber}.pdf`
    };
};

const getAllInvoices = async (filters = {}, options = {}) => {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const skip = (page - 1) * limit;

    const invoices = await prisma.invoice.findMany({
        where: filters,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        include: { user: { select: { name: true, email: true } } }
    });

    const total = await prisma.invoice.count({ where: filters });
    return { invoices, total, page, limit };
};

const deleteInvoice = async (invoiceId) => {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw ApiError.notFound('Invoice not found');
    await prisma.invoice.delete({ where: { id: invoiceId } });
};

module.exports = {
    generateInvoice,
    downloadInvoice,
    getAllInvoices,
    deleteInvoice
};
