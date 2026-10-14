const schemeService = require('./scheme.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');
const prisma = require('../../config/prisma');

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
    const isStaff = req.user.role === 'super_admin' || req.user.role === 'admin' || req.user.role === 'staff';
    
    // For customers self-enrolling online, automatically assign 'ONLINE' (no store required)
    // For staff enrolling in-store, use passed store or primary store
    const shopId = await resolveShopId(req, !isStaff);

    // If staff provided customerId, use it; otherwise, the authenticated user is enrolling themselves
    const customerId = (isStaff && req.body.customerId) ? req.body.customerId : req.user.id;

    const schemeData = {
        ...req.body,
        shop_id: shopId,
        customerId,
        enrolledByRole: isStaff ? req.user.role : 'customer',
        performedBy: req.user.id
    };

    const scheme = await schemeService.enrollCustomer(schemeData);
    ApiResponse.created(scheme, 'Customer enrolled in scheme successfully').send(res);
});

const recordInstallment = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const paymentData = req.body;
    
    if (!paymentData.amount || !paymentData.method) {
        return ApiResponse.error('Amount and payment method are required', 400).send(res);
    }

    const scheme = await schemeService.recordInstallment(schemeId, paymentData, req.user.id);
    ApiResponse.success(scheme, 'Installment recorded successfully').send(res);
});

const getStoreSchemes = asyncHandler(async (req, res) => {
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
    const scheme = await schemeService.getSchemeById(schemeId);
    if (!scheme) return ApiResponse.error('Scheme not found', 404).send(res);
    ApiResponse.success(scheme, 'Scheme fetched successfully').send(res);
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
    const quote = await schemeService.getRedemptionQuote(schemeId);
    ApiResponse.success(quote, 'Redemption quote calculated successfully').send(res);
});

const requestClosureOTP = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const result = await schemeService.requestClosureOTP(schemeId, req.user.id);
    ApiResponse.success(result, 'Closure OTP sent to customer').send(res);
});

const closeSchemeWithOTP = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const { otp, closureData } = req.body;
    if (!otp) {
        return ApiResponse.error('OTP is required to close scheme', 400).send(res);
    }
    const result = await schemeService.closeSchemeWithOTP(schemeId, otp, closureData, req.user.id);
    ApiResponse.success(result, 'Scheme closed successfully').send(res);
});

const verifyClosureOTP = asyncHandler(async (req, res) => {
    const schemeId = req.params.id;
    const { otp } = req.body;
    if (!otp) {
        return ApiResponse.error('OTP is required', 400).send(res);
    }
    const result = await schemeService.verifyClosureOTP(schemeId, otp);
    ApiResponse.success(result, 'Customer OTP verified successfully').send(res);
});

const processExpiredSchemes = asyncHandler(async (req, res) => {
    const shop_id = await resolveShopId(req);
    const results = await schemeService.processExpiredSchemes(shop_id);
    ApiResponse.success(results, `Processed ${results.length} expired schemes`).send(res);
});

/**
 * GET /schemes/settings  – returns scheme configuration defaults for this shop
 * These are set by admin/superadmin and consumed by:
 *   - Enrollment form (to display min installment, applicable purities to staff)
 *   - Installment validation (server-side min check)
 */
const getSchemeSettings = asyncHandler(async (req, res) => {
    const shop_id = await resolveShopId(req);

    const store = await prisma.store.findUnique({ where: { shop_id } }) || await prisma.store.findFirst();
    const meta = (store?.metadata && typeof store.metadata === 'object') ? store.metadata : {};
    const settings = meta.schemeSettings || {};

    // Return with sensible defaults if admin hasn't configured yet
    ApiResponse.success({
        shop_id: store?.shop_id || shop_id,
        minMonthlyInstallment: settings.minMonthlyInstallment ?? 1000,
        applicablePurities: settings.applicablePurities ?? ['22K', '18K', '14K'],
        totalMonths: settings.totalMonths ?? 11,
        bonusPercentage: settings.bonusPercentage ?? 100,
        maxInstallmentsPerTx: settings.maxInstallmentsPerTx ?? 5,
        isConfigured: Boolean(meta.schemeSettings)
    }, 'Scheme settings fetched successfully').send(res);
});

/**
 * PUT /schemes/settings  – update scheme configuration for this shop
 * Only admin / super_admin can call this.
 */
const updateSchemeSettings = asyncHandler(async (req, res) => {
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        return ApiResponse.error('Only admin/super_admin can update scheme settings', 403).send(res);
    }

    let shop_id = await resolveShopId(req);

    const { minMonthlyInstallment, applicablePurities, totalMonths, bonusPercentage, maxInstallmentsPerTx } = req.body;

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

    let store = await prisma.store.findUnique({ where: { shop_id } });
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
    getStoreSchemes,
    getUserStatements,
    getScheme,
    updateScheme,
    deleteScheme,
    getSchemeTerms,
    getRedemptionQuote,
    requestClosureOTP,
    closeSchemeWithOTP,
    verifyClosureOTP,
    processExpiredSchemes,
    getSchemeSettings,
    updateSchemeSettings
};
