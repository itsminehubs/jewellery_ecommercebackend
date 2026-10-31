const schemeService = require('./scheme.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');
const prisma = require('../../config/prisma');

const { USER_ROLES } = require('../../utils/constants');

/**
 * Helper to check if the authenticated user is an authorized employee
 * (super_admin, admin, store_manager, sales_staff, accounts_finance, staff)
 */
const isStaffUser = (user) => {
    if (!user || !user.role) return false;
    return [
        USER_ROLES.SUPER_ADMIN,
        USER_ROLES.ADMIN,
        USER_ROLES.STORE_MANAGER,
        USER_ROLES.SALES_STAFF,
        USER_ROLES.ACCOUNTS_FINANCE,
        'staff'
    ].includes(user.role);
};

/**
 * Helper to dynamically resolve shop_id:
 * - If provided in headers, query, or body (from POS terminal or admin dropdown), use it.
 * - If not provided and caller is an online customer, default to 'ONLINE'.
 * - If a physical store is needed for store settings, dynamically find the primary store from DB.
 */
const resolveShopId = async (req, fallbackToOnline = false) => {
    let shopId = req.headers['x-shop-id'] || req.query?.shop_id || req.body?.shop_id;
    if (!shopId) {
        if (fallbackToOnline) {
            return 'ONLINE';
        }
        const primaryStore = await prisma.store.findFirst({ 
            orderBy: { createdAt: 'asc' }, 
            select: { shop_id: true } 
        });
        shopId = primaryStore?.shop_id || 'ONLINE';
    }
    return shopId;
};

const enrollCustomer = asyncHandler(async (req, res) => {
    const isStaff = isStaffUser(req.user);
    
    // For customers self-enrolling online, automatically assign 'ONLINE' (no store required)
    // For staff enrolling in-store, use passed store or primary store
    const shopId = await resolveShopId(req, !isStaff);

    // If staff provided customerId, use it; if staff enrolling new customer, pass null so schemeService creates/finds by phone; otherwise customer enrolling themselves
    const customerId = (isStaff && req.body.customerId) ? req.body.customerId : (isStaff ? null : req.user.id);

    const schemeData = {
        ...req.body,
        shop_id: shopId,
        customerId,
        enrolledByRole: isStaff ? req.user.role : 'customer',
        enrolledByName: isStaff ? (req.user.name || 'Sales Staff') : req.user.name,
        performedBy: req.user.id,
        performedByName: req.user.name || null
    };

    const scheme = await schemeService.enrollCustomer(schemeData);
    ApiResponse.created(scheme, 'Customer enrolled in scheme successfully').send(res);
});

const recordInstallment = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const isStaff = isStaffUser(req.user);

    // Only resolve physical store shop_id if collected by showroom staff; online app users have no shop_id!
    const shop_id = isStaff ? (req.headers['x-shop-id'] || req.user.storeId || req.user.shop_id || req.body.shop_id || null) : null;
    const paymentData = {
        ...req.body,
        ...(shop_id ? { shop_id } : {})
    };
    
    if (!paymentData.amount || !paymentData.method) {
        return ApiResponse.error('Amount and payment method are required', 400).send(res);
    }

    const scheme = await schemeService.recordInstallment(schemeId, paymentData, req.user.id, req.user.role);
    ApiResponse.success(scheme, 'Installment recorded successfully').send(res);
});

const createPaymentOrder = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const { amount } = req.body;
    const orderData = await schemeService.createSchemePaymentOrder(schemeId, amount, req.user.id);
    ApiResponse.success(orderData, 'Scheme payment order created successfully').send(res);
});

const verifyPayment = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const updatedScheme = await schemeService.verifySchemePayment(schemeId, req.body, req.user.id);
    ApiResponse.success(updatedScheme, 'Payment verified and gold credited successfully').send(res);
});

const getStoreSchemes = asyncHandler(async (req, res) => {
    const isStaff = isStaffUser(req.user);
    if (!isStaff) {
        return ApiResponse.error('Access denied: Only showroom staff and administrators can view store schemes', 403).send(res);
    }

    // If shop_id filter is passed (from dropdown or POS), filter by that store.
    // If not passed, query ALL schemes across all stores and online!
    const shop_id = req.headers['x-shop-id'] || req.query.shop_id || null;

    const schemes = await schemeService.getStoreSchemes(shop_id, req.query);
    ApiResponse.success(schemes, 'Schemes fetched successfully').send(res);
});

const getUserStatements = asyncHandler(async (req, res) => {
    // Users can only fetch their own statements
    const customerId = req.user.id;
    const statements = await schemeService.getUserSchemeStatements(customerId);
    ApiResponse.success(statements, 'Scheme statements fetched successfully').send(res);
});

const getScheme = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const isStaff = isStaffUser(req.user);
    const scheme = await schemeService.getSchemeById(schemeId);
    if (!scheme) return ApiResponse.error('Scheme not found', 404).send(res);
    
    // IDOR Protection: Non-staff users can only view their own scheme
    if (!isStaff && scheme.customerId !== req.user.id) {
        return ApiResponse.error('Access denied: You can only view your own scheme details', 403).send(res);
    }

    ApiResponse.success(scheme, 'Scheme fetched successfully').send(res);
});

const downloadPassbookPdf = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const isStaff = isStaffUser(req.user);
    const scheme = await schemeService.getSchemeById(schemeId);
    if (!scheme) return ApiResponse.error('Scheme not found', 404).send(res);

    if (!isStaff && scheme.customerId !== req.user.id) {
        return ApiResponse.error('Access denied: You can only download your own passbook', 403).send(res);
    }

    let store = null;
    if (scheme.shopId && scheme.shopId !== 'ONLINE') {
        store = await prisma.store.findUnique({ where: { shop_id: scheme.shopId } }).catch(() => null);
    }

    const { generateSchemePassbookPdf } = require('../../utils/schemePdfGenerator');
    const pdfBuffer = await generateSchemePassbookPdf(scheme, store || {});

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CarbonSmith_Passbook_${scheme.schemeId || 'CS-SCH'}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
});

const updateScheme = asyncHandler(async (req, res) => {
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        return ApiResponse.error('Only admin can update schemes', 403).send(res);
    }
    const schemeId = req.params.id;
    const scheme = await schemeService.updateScheme(schemeId, req.body, req.user.id);
    ApiResponse.success(scheme, 'Scheme updated successfully').send(res);
});

const deleteScheme = asyncHandler(async (req, res) => {
    if (req.user.role !== 'super_admin') {
        return ApiResponse.error('Only super_admin can cancel schemes', 403).send(res);
    }
    const schemeId = req.params.id;
    const scheme = await schemeService.deleteScheme(schemeId, req.user.id);
    ApiResponse.success(scheme, 'Scheme cancelled successfully').send(res);
});

const getSchemeTerms = asyncHandler(async (req, res) => {
    const terms = schemeService.getSchemeTerms();
    ApiResponse.success(terms, 'Scheme terms and conditions fetched successfully').send(res);
});

const getRedemptionQuote = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const isStaff = isStaffUser(req.user);
    const scheme = await schemeService.getSchemeById(schemeId);
    if (!scheme) return ApiResponse.error('Scheme not found', 404).send(res);

    // IDOR Protection: Non-staff users can only quote their own scheme
    if (!isStaff && scheme.customerId !== req.user.id) {
        return ApiResponse.error('Access denied: You can only view your own redemption quote', 403).send(res);
    }

    const quote = await schemeService.getRedemptionQuote(schemeId);
    ApiResponse.success(quote, 'Redemption quote calculated successfully').send(res);
});

const requestClosureOTP = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const isStaff = isStaffUser(req.user);
    const scheme = await schemeService.getSchemeById(schemeId);
    if (!scheme) return ApiResponse.error('Scheme not found', 404).send(res);

    // IDOR Protection: Non-staff users can only request closure OTP for their own scheme
    if (!isStaff && scheme.customerId !== req.user.id) {
        return ApiResponse.error('Access denied: You can only request closure OTP for your own scheme', 403).send(res);
    }

    const result = await schemeService.requestClosureOTP(schemeId, req.user.id);
    ApiResponse.success(result, 'Closure OTP sent to customer').send(res);
});

const closeSchemeWithOTP = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const { otp, managementOtp, closureData } = req.body;
    if (!otp) {
        return ApiResponse.error('Customer OTP is required to close scheme', 400).send(res);
    }

    const isStaff = isStaffUser(req.user);
    const scheme = await schemeService.getSchemeById(schemeId);
    if (!scheme) return ApiResponse.error('Scheme not found', 404).send(res);

    // IDOR Protection: Non-staff users can only close their own scheme
    if (!isStaff && scheme.customerId !== req.user.id) {
        return ApiResponse.error('Access denied: You can only close your own scheme', 403).send(res);
    }

    const result = await schemeService.closeSchemeWithOTP(schemeId, otp, managementOtp, closureData, req.user.id, req.user.role);
    ApiResponse.success(result, 'Scheme closed successfully').send(res);
});

const verifyClosureOTP = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const { otp } = req.body;
    if (!otp) {
        return ApiResponse.error('Customer OTP is required', 400).send(res);
    }

    const isStaff = isStaffUser(req.user);
    const scheme = await schemeService.getSchemeById(schemeId);
    if (!scheme) return ApiResponse.error('Scheme not found', 404).send(res);

    if (!isStaff && scheme.customerId !== req.user.id) {
        return ApiResponse.error('Access denied: You can only verify OTP for your own scheme', 403).send(res);
    }

    const result = await schemeService.verifyClosureOTP(schemeId, otp, req.user.id);
    ApiResponse.success(result, 'Customer OTP verified successfully').send(res);
});

const requestManagementClosureOTP = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const scheme = await schemeService.getSchemeById(schemeId);
    if (!scheme) return ApiResponse.error('Scheme not found', 404).send(res);

    const result = await schemeService.requestManagementClosureOTP(schemeId, req.user.id);
    ApiResponse.success(result, result.message).send(res);
});

const verifyManagementClosureOTP = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const { otp } = req.body;
    if (!otp) {
        return ApiResponse.error('Management OTP is required', 400).send(res);
    }

    const scheme = await schemeService.getSchemeById(schemeId);
    if (!scheme) return ApiResponse.error('Scheme not found', 404).send(res);

    const result = await schemeService.verifyManagementClosureOTP(schemeId, otp, req.user.id);
    ApiResponse.success(result, result.message).send(res);
});

const processExpiredSchemes = asyncHandler(async (req, res) => {
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        return ApiResponse.error('Only admin or super_admin can process expired schemes', 403).send(res);
    }
    // If a shop_id query param is passed, filter by that shop; otherwise process all expired schemes globally!
    const shop_id = req.query?.shop_id || req.body?.shop_id || null;
    const results = await schemeService.processExpiredSchemes(shop_id);
    ApiResponse.success(results, `Processed ${results.length} expired schemes`).send(res);
});

/**
 * GET /schemes/settings – returns scheme configuration defaults for store or online
 */
const getSchemeSettings = asyncHandler(async (req, res) => {
    const shop_id = req.headers['x-shop-id'] || req.query?.shop_id;

    let store = null;
    if (shop_id && shop_id !== 'ONLINE') {
        store = await prisma.store.findUnique({ where: { shop_id } });
    }
    if (!store) {
        store = await prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
    }

    const meta = (store?.metadata && typeof store.metadata === 'object') ? store.metadata : {};
    const settings = meta.schemeSettings || {};

    // Return with sensible defaults if admin hasn't configured yet
    ApiResponse.success({
        shop_id: store?.shop_id || 'ONLINE',
        minMonthlyInstallment: settings.minMonthlyInstallment ?? 1000,
        applicablePurities: settings.applicablePurities ?? ['22K', '18K', '14K'],
        totalMonths: settings.totalMonths ?? 11,
        bonusPercentage: settings.bonusPercentage ?? 100,
        maxInstallmentsPerTx: settings.maxInstallmentsPerTx ?? 5,
        // Configurable discount rates
        goldMakingDiscountUpToHalf: settings.goldMakingDiscountUpToHalf ?? 50,
        goldMakingDiscountUpToFull: settings.goldMakingDiscountUpToFull ?? settings.goldMakingDiscountFull ?? 100,
        goldMakingDiscountFull: settings.goldMakingDiscountUpToFull ?? settings.goldMakingDiscountFull ?? 100,
        diamondFlatDiscountHalf: settings.diamondFlatDiscountHalf ?? 20,
        diamondMakingFlatDiscountHalf: settings.diamondMakingFlatDiscountHalf ?? settings.diamondMakingDiscountHalf ?? 20,
        diamondMakingDiscountHalf: settings.diamondMakingFlatDiscountHalf ?? settings.diamondMakingDiscountHalf ?? 20,
        diamondFlatDiscountFull: settings.diamondFlatDiscountFull ?? 40,
        diamondMakingFlatDiscountFull: settings.diamondMakingFlatDiscountFull ?? settings.diamondMakingDiscountFull ?? 40,
        diamondMakingDiscountFull: settings.diamondMakingFlatDiscountFull ?? settings.diamondMakingDiscountFull ?? 40,
        isConfigured: Boolean(meta.schemeSettings)
    }, 'Scheme settings fetched successfully').send(res);
});

/**
 * PUT /schemes/settings – update scheme configuration for this shop
 * Admin / super_admin / store_manager can call this.
 */
const updateSchemeSettings = asyncHandler(async (req, res) => {
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin' && req.user.role !== 'store_manager') {
        return ApiResponse.error('Only admin, super_admin, or store_manager can update scheme settings', 403).send(res);
    }

    let shop_id = req.headers['x-shop-id'] || req.query?.shop_id || req.body?.shop_id;

    const { 
        minMonthlyInstallment, 
        applicablePurities, 
        totalMonths, 
        bonusPercentage, 
        maxInstallmentsPerTx,
        goldMakingDiscountUpToHalf,
        diamondFlatDiscountHalf,
        diamondFlatDiscountFull
    } = req.body;

    // Accept both naming conventions for full compatibility with frontend
    const goldMakingDiscountUpToFull = req.body.goldMakingDiscountUpToFull != null
        ? req.body.goldMakingDiscountUpToFull
        : req.body.goldMakingDiscountFull;
    const diamondMakingFlatDiscountHalf = req.body.diamondMakingFlatDiscountHalf != null
        ? req.body.diamondMakingFlatDiscountHalf
        : req.body.diamondMakingDiscountHalf;
    const diamondMakingFlatDiscountFull = req.body.diamondMakingFlatDiscountFull != null
        ? req.body.diamondMakingFlatDiscountFull
        : req.body.diamondMakingDiscountFull;

    // Validate
    if (minMonthlyInstallment != null && Number(minMonthlyInstallment) <= 0) {
        return ApiResponse.error('Minimum monthly installment must be a positive amount', 400).send(res);
    }
    if (applicablePurities != null) {
        const purities = Array.isArray(applicablePurities)
            ? applicablePurities
            : String(applicablePurities).split(',').map(s => s.trim()).filter(Boolean);
        if (purities.length === 0) {
            return ApiResponse.error('At least one applicable purity must be specified', 400).send(res);
        }
    }

    let store = null;
    if (shop_id && shop_id !== 'ONLINE') {
        store = await prisma.store.findUnique({ where: { shop_id } });
    }
    if (!store) {
        store = await prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
        if (store) shop_id = store.shop_id;
    }
    if (!store) {
        return ApiResponse.error('No store found. Please configure a store in Store Management first.', 404).send(res);
    }

    const currentMeta = (store.metadata && typeof store.metadata === 'object') ? store.metadata : {};
    const currentSettings = currentMeta.schemeSettings || {};

    const newSettings = {
        ...currentSettings,
        ...(minMonthlyInstallment != null ? { minMonthlyInstallment: Number(minMonthlyInstallment) } : {}),
        ...(applicablePurities != null ? {
            applicablePurities: Array.isArray(applicablePurities)
                ? applicablePurities
                : String(applicablePurities).split(',').map(s => s.trim()).filter(Boolean)
        } : {}),
        ...(totalMonths != null ? { totalMonths: Number(totalMonths) } : {}),
        ...(bonusPercentage != null ? { bonusPercentage: Number(bonusPercentage) } : {}),
        ...(maxInstallmentsPerTx != null ? { maxInstallmentsPerTx: Number(maxInstallmentsPerTx) } : {}),
        ...(goldMakingDiscountUpToHalf != null ? { goldMakingDiscountUpToHalf: Number(goldMakingDiscountUpToHalf) } : {}),
        ...(goldMakingDiscountUpToFull != null ? { goldMakingDiscountUpToFull: Number(goldMakingDiscountUpToFull) } : {}),
        ...(diamondFlatDiscountHalf != null ? { diamondFlatDiscountHalf: Number(diamondFlatDiscountHalf) } : {}),
        ...(diamondMakingFlatDiscountHalf != null ? { diamondMakingFlatDiscountHalf: Number(diamondMakingFlatDiscountHalf) } : {}),
        ...(diamondFlatDiscountFull != null ? { diamondFlatDiscountFull: Number(diamondFlatDiscountFull) } : {}),
        ...(diamondMakingFlatDiscountFull != null ? { diamondMakingFlatDiscountFull: Number(diamondMakingFlatDiscountFull) } : {}),
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString()
    };

    await prisma.store.update({
        where: { id: store.id },
        data: { metadata: { ...currentMeta, schemeSettings: newSettings } }
    });

    ApiResponse.success({ shop_id: store.shop_id, ...newSettings }, 'Scheme settings updated successfully').send(res);
});

module.exports = {
    enrollCustomer,
    recordInstallment,
    createPaymentOrder,
    verifyPayment,
    getStoreSchemes,
    getUserStatements,
    getScheme,
    downloadPassbookPdf,
    updateScheme,
    deleteScheme,
    getSchemeTerms,
    getRedemptionQuote,
    requestClosureOTP,
    closeSchemeWithOTP,
    verifyClosureOTP,
    requestManagementClosureOTP,
    verifyManagementClosureOTP,
    processExpiredSchemes,
    getSchemeSettings,
    updateSchemeSettings
};
