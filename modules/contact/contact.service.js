const prisma = require('../../config/prisma');

/**
 * Submit a contact inquiry
 * @param {Object} contactData 
 */
const submitInquiry = async (contactData) => {
    return await prisma.contact.create({
        data: {
            name: contactData.fullName || contactData.name || 'Unknown',
            email: contactData.email,
            phone: contactData.phone,
            subject: contactData.purpose || contactData.subject || 'General Inquiry',
            message: contactData.message
        }
    });
};

/**
 * Get all contact inquiries (for admin)
 */
const getAllInquiries = async (filters = {}) => {
    const page = parseInt(filters.page, 10) || 1;
    const limit = parseInt(filters.limit, 10) || 10;
    
    if (filters.page && filters.limit) {
        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            prisma.contact.findMany({
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.contact.count()
        ]);
        return { items, total, page, pages: Math.ceil(total / limit) };
    }

    const items = await prisma.contact.findMany({
        orderBy: { createdAt: 'desc' }
    });
    return items;
};

module.exports = {
    submitInquiry,
    getAllInquiries
};
