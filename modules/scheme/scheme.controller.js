const schemeService = require('./scheme.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');
const prisma = require('../../config/prisma');

const enrollCustomer = asyncHandler(async (req, res) => {
    const schemeData = {
        ...req.body,
        shop_id: req.headers['x-shop-id'] || req.body.shop_id
    };

    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        return ApiResponse.error('Only super_admin can enroll customers in schemes', 403).send(res);
    }

    if (!schemeData.shop_id) {
        return ApiResponse.error('Shop ID is required', 400).send(res);
    }
    if (!schemeData.customerId) {
        return ApiResponse.error('Customer ID is required', 400).send(res);
    }

    schemeData.performedBy = req.user.id;

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
    const shop_id = req.headers['x-shop-id'] || req.query.shop_id;
    if (!shop_id) {
        return ApiResponse.error('Shop ID is required', 400).send(res);
    }
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

/**
 * GET /schemes/settings  – returns scheme configuration defaults for this shop
 * These are set by admin/superadmin and consumed by:
 *   - Enrollment form (to display min installment, applicable purities to staff)
 *   - Installment validation (server-side min check)
 */
const getSchemeSettings = asyncHandler(async (req, res) => {
    const shop_id = req.headers['x-shop-id'] || req.query.shop_id;
    if (!shop_id) return ApiResponse.error('Shop ID is required', 400).send(res);

    const store = await prisma.store.findUnique({ where: { shop_id } });
    if (!store) return ApiResponse.error('Store not found', 404).send(res);

    const meta = (store.metadata && typeof store.metadata === 'object') ? store.metadata : {};
    const settings = meta.schemeSettings || {};

    // Return with sensible defaults if admin hasn't configured yet
    ApiResponse.success({
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

    const shop_id = req.headers['x-shop-id'] || req.body.shop_id;
    if (!shop_id) return ApiResponse.error('Shop ID is required', 400).send(res);

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

    const store = await prisma.store.findUnique({ where: { shop_id } });
    if (!store) return ApiResponse.error('Store not found', 404).send(res);

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
        where: { shop_id },
        data: { metadata: { ...currentMeta, schemeSettings: newSettings } }
    });

    ApiResponse.success(newSettings, 'Scheme settings updated successfully').send(res);
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
    getSchemeSettings,
    updateSchemeSettings
};
