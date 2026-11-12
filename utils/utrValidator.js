/**
 * UTR (Unique Transaction Reference) validation and duplicate checking utility.
 * Enforces mandatory UTR for NEFT / RTGS / Bank Transfer payments across all sales and invoices.
 * Prevents invoice creation if duplicate UTR is detected.
 */

async function findDuplicateUtr(prismaClient, rawUtr) {
    if (!rawUtr) return null;
    const cleanUtr = String(rawUtr).trim();
    if (!cleanUtr) return null;

    // 1. Check SchemeInstallment
    try {
        const dupScheme = await prismaClient.schemeInstallment.findFirst({
            where: {
                transactionId: { equals: cleanUtr, mode: 'insensitive' }
            },
            include: {
                scheme: {
                    select: { schemeId: true }
                }
            }
        });
        if (dupScheme) {
            return {
                isDuplicate: true,
                cleanUtr,
                source: 'scheme_installment',
                reference: dupScheme.scheme?.schemeId || dupScheme.schemeId,
                message: `Duplicate UTR "${cleanUtr}". Already used in Scheme ${dupScheme.scheme?.schemeId || ''} installment.`
            };
        }
    } catch (err) {
        console.error('Error checking SchemeInstallment for UTR:', err.message);
    }

    // 2. Check POSOrder notes
    try {
        const dupPos = await prismaClient.pOSOrder.findFirst({
            where: {
                notes: { contains: cleanUtr, mode: 'insensitive' }
            },
            select: { orderNumber: true }
        });
        if (dupPos) {
            return {
                isDuplicate: true,
                cleanUtr,
                source: 'pos_order',
                reference: dupPos.orderNumber,
                message: `Duplicate UTR "${cleanUtr}". Already used in POS Invoice #${dupPos.orderNumber}.`
            };
        }
    } catch (err) {
        console.error('Error checking POSOrder for UTR:', err.message);
    }

    // 3. Check GoldBarSale notes
    try {
        const dupGold = await prismaClient.goldBarSale.findFirst({
            where: {
                notes: { contains: cleanUtr, mode: 'insensitive' }
            },
            select: { orderNumber: true }
        });
        if (dupGold) {
            return {
                isDuplicate: true,
                cleanUtr,
                source: 'gold_bar_sale',
                reference: dupGold.orderNumber,
                message: `Duplicate UTR "${cleanUtr}". Already used in Gold Bar Invoice #${dupGold.orderNumber}.`
            };
        }
    } catch (err) {
        console.error('Error checking GoldBarSale for UTR:', err.message);
    }

    // 4. Check ImitationSale notes
    try {
        const dupImitation = await prismaClient.imitationSale.findFirst({
            where: {
                notes: { contains: cleanUtr, mode: 'insensitive' }
            },
            select: { orderNumber: true }
        });
        if (dupImitation) {
            return {
                isDuplicate: true,
                cleanUtr,
                source: 'imitation_sale',
                reference: dupImitation.orderNumber,
                message: `Duplicate UTR "${cleanUtr}". Already used in Imitation Invoice #${dupImitation.orderNumber}.`
            };
        }
    } catch (err) {
        console.error('Error checking ImitationSale for UTR:', err.message);
    }

    // 5. Check CreditMemo notes
    try {
        const dupCredit = await prismaClient.creditMemo.findFirst({
            where: {
                notes: { contains: cleanUtr, mode: 'insensitive' }
            },
            select: { memoId: true }
        });
        if (dupCredit) {
            return {
                isDuplicate: true,
                cleanUtr,
                source: 'credit_memo',
                reference: dupCredit.memoId,
                message: `Duplicate UTR "${cleanUtr}". Already used in Advance / Credit Memo #${dupCredit.memoId}.`
            };
        }
    } catch (err) {
        console.error('Error checking CreditMemo for UTR:', err.message);
    }

    return null;
}

const isNeftOrRtgs = (method) => {
    if (!method) return false;
    const m = String(method).toLowerCase().trim();
    return m === 'neft' || m === 'rtgs' || m === 'neft_rtgs' || m === 'bank_transfer';
};

const isNeftOrBankTransfer = isNeftOrRtgs;

async function validateAndCheckDuplicateUtr(prismaClient, rawUtr, method = 'NEFT/RTGS') {
    const cleanUtr = String(rawUtr || '').trim().toUpperCase();
    const methodLabel = String(method).toUpperCase();
    if (!cleanUtr) {
        throw new Error(`Bank UTR Number is mandatory to process invoice with ${methodLabel} payment.`);
    }
    if (cleanUtr.length < 6) {
        throw new Error(`Invalid UTR "${cleanUtr}". Bank UTR must be at least 6 characters (e.g. HDFCR52024091512).`);
    }
    if (!/^[A-Z0-9]+$/.test(cleanUtr)) {
        throw new Error(`Invalid UTR format for "${cleanUtr}". Bank UTR must contain only letters and numbers (no spaces or special symbols).`);
    }

    const dup = await findDuplicateUtr(prismaClient, cleanUtr);
    if (dup && dup.isDuplicate) {
        throw new Error(dup.message);
    }

    return cleanUtr;
}

module.exports = {
    findDuplicateUtr,
    validateAndCheckDuplicateUtr,
    isNeftOrRtgs,
    isNeftOrBankTransfer
};
