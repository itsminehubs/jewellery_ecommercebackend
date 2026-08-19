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
const getAllInquiries = async () => {
    return await prisma.contact.findMany({
        orderBy: { createdAt: 'desc' }
    });
};

module.exports = {
    submitInquiry,
    getAllInquiries
};
