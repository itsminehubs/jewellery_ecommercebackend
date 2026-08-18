const prisma = require('../../config/prisma');

/**
 * Submit a contact inquiry
 * @param {Object} contactData 
 */
const submitInquiry = async (contactData) => {
    return await prisma.contact.create({
        data: {
            name: contactData.name,
            email: contactData.email,
            phone: contactData.phone,
            subject: contactData.subject,
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
