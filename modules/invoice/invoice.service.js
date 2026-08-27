const prisma = require('../../config/prisma');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const { generatePDF, amountToWords } = require('../../utils/pdfService');
const { sendEmail } = require('../../jobs/email.job');
const { generateInvoiceEmail } = require('../../utils/emailTemplates');

const generateInvoice = async (orderId, adminId) => {
    let order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: { include: { addresses: true } }, items: { include: { product: true } } }
    });

    let isPosOrder = false;

    if (!order) {
        order = await prisma.pOSOrder.findUnique({
            where: { id: orderId },
            include: { customer: { include: { addresses: true } }, items: { include: { product: true } } }
        });
        if (order) {
            isPosOrder = true;
            // Map customer to user for email dispatch compatibility
            order.user = order.customer;
        }
    }

    if (!order) throw ApiError.notFound('Order not found');

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    let startYear, endYear;
    if (currentMonth >= 3) {
        startYear = currentYear;
        endYear = currentYear + 1;
    } else {
        startYear = currentYear - 1;
        endYear = currentYear;
    }
    
    const startYearStr = startYear.toString().slice(-2);
    const endYearStr = endYear.toString().slice(-2);
    const fyString = `${startYearStr}/${endYearStr}`;

    const fyStartDate = new Date(startYear, 3, 1);
    
    const lastInvoice = await prisma.invoice.findFirst({
        where: { createdAt: { gte: fyStartDate } },
        orderBy: { createdAt: 'desc' }
    });

    let nextNumber = 1;
    if (lastInvoice && lastInvoice.invoiceNumber.includes(`CS-INV-${fyString}-`)) {
        const parts = lastInvoice.invoiceNumber.split('-');
        const lastNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastNum)) {
            nextNumber = lastNum + 1;
        }
    } else if (!lastInvoice) {
        const count = await prisma.invoice.count({ where: { createdAt: { gte: fyStartDate } } });
        nextNumber = count + 1;
    }

    const formattedNumber = String(nextNumber).padStart(4, '0');
    const invoiceNumber = `CS-INV-${fyString}-${formattedNumber}`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const invoice = await prisma.invoice.create({
        data: {
            [isPosOrder ? 'posOrderId' : 'orderId']: order.id,
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
        include: { 
            order: { include: { user: { include: { addresses: true } }, items: { include: { product: true } } } },
            posOrder: { include: { customer: { include: { addresses: true } }, items: { include: { product: true } } } }
        }
    });

    if (!invoice) throw ApiError.notFound('Invoice not found');

    const order = invoice.order || invoice.posOrder;
    if (!order) throw ApiError.notFound('Order not found');
    if (invoice.posOrder) {
        order.user = invoice.posOrder.customer;
    }

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
