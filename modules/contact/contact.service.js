const Contact = require('./contact.model');

/**
 * Submit a contact inquiry
 * @param {Object} contactData 
 * @returns {Promise<Contact>}
 */
const submitInquiry = async (contactData) => {
    return await Contact.create(contactData);
};

/**
 * Get all contact inquiries (for admin)
 * @returns {Promise<Array>}
 */
const getAllInquiries = async () => {
    return await Contact.find().sort({ createdAt: -1 });
};

module.exports = {
    submitInquiry,
    getAllInquiries
};
