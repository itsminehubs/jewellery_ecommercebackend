const contactService = require('./contact.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const submitInquiry = asyncHandler(async (req, res) => {
    const inquiry = await contactService.submitInquiry(req.body);
    ApiResponse.success(inquiry, 'Inquiry submitted successfully', 201).send(res);
});

const getAllInquiries = asyncHandler(async (req, res) => {
    const inquiries = await contactService.getAllInquiries();
    ApiResponse.success(inquiries, 'Inquiries fetched successfully').send(res);
});

module.exports = {
    submitInquiry,
    getAllInquiries
};
