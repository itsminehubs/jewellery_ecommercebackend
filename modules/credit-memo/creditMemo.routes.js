const express = require('express');
const router = express.Router();
const creditMemoController = require('./creditMemo.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { hasRole } = require('../../middlewares/admin.middleware');
const { USER_ROLES } = require('../../utils/constants');
const validate = require('../../middlewares/validate.middleware');
const { createCreditMemoSchema } = require('../../validations/creditMemo.validation');

router.use(authenticate);

router.get('/', hasRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.STORE_MANAGER]), creditMemoController.getAllCreditMemos);
router.post('/', hasRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.STORE_MANAGER, USER_ROLES.SALES_STAFF]), validate(createCreditMemoSchema), creditMemoController.createCreditMemo);
router.get('/search/:term', hasRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.STORE_MANAGER, USER_ROLES.SALES_STAFF]), creditMemoController.searchActiveMemos);
router.put('/:id', hasRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), creditMemoController.updateCreditMemo);
router.delete('/:id', hasRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), creditMemoController.deleteCreditMemo);

module.exports = router;
