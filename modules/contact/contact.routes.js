const express = require('express');
const router = express.Router();
const contactController = require('./contact.controller');

router.post('/', contactController.submitInquiry);
router.get('/', contactController.getAllInquiries); // Admin might need this later

module.exports = router;
