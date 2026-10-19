/**
 * Gold Purity Parsing and Conversion Utilities
 * Handles dynamic conversion between purities (14K, 18K, 22K, 24K, 916, 750, etc.)
 * using nominal Karat and canonical Fine Gold (24K) ratios.
 */

/**
 * Extract numerical Karat value from purity string
 * @param {string|number} purityStr - e.g. "22K", "18K", "14K", "24K", "916", "750", "99.9", "99.5"
 * @returns {number} Nominal Karat (e.g. 24, 22, 18, 14)
 */
const parseKarat = (purityStr) => {
    if (typeof purityStr === 'number') {
        if (purityStr > 0 && purityStr <= 24) return purityStr;
        if (purityStr >= 900) return (purityStr / 1000) * 24; // e.g. 916 -> 21.984 ~ 22
    }
    const clean = String(purityStr || '').trim().toUpperCase();

    if (clean.includes('24') || clean.includes('99.9') || clean.includes('FINE')) return 24;
    if (clean.includes('99.5')) return 23.88; // 99.5% fine gold
    if (clean.includes('22') || clean.includes('916')) return 22;
    if (clean.includes('18') || clean.includes('750')) return 18;
    if (clean.includes('14') || clean.includes('585')) return 14;
    if (clean.includes('10')) return 10;
    if (clean.includes('9K') || clean === '9') return 9;

    // Check if starts with a number like "18", "22"
    const match = clean.match(/(\d+(?:\.\d+)?)/);
    if (match) {
        const val = parseFloat(match[1]);
        if (val <= 24 && val > 0) return val;
        if (val >= 900) return (val / 1000) * 24;
    }

    return 22; // default standard reference
};

/**
 * Convert gold grams from one purity to another using purity ratio:
 * TargetGrams = SourceGrams * (SourceKarat / TargetKarat)
 *
 * Example: 1.5g of 22K -> 18K:
 * 1.5 * (22 / 18) = 1.833333g
 *
 * @param {number} grams - Weight in source purity
 * @param {string|number} fromPurity - Source purity (e.g. "22K")
 * @param {string|number} toPurity - Target purity (e.g. "18K")
 * @returns {number} Equivalent weight in target purity
 */
const convertGoldQuantity = (grams, fromPurity, toPurity) => {
    const g = Number(grams) || 0;
    if (g <= 0) return 0;
    const kFrom = parseKarat(fromPurity);
    const kTo = parseKarat(toPurity);
    if (kTo <= 0) return 0;
    return (g * kFrom) / kTo;
};

/**
 * Convert grams of any purity into canonical Fine Gold (24K Pure Gold):
 * PureGrams = Grams * (Karat / 24)
 *
 * @param {number} grams
 * @param {string|number} purity
 * @returns {number} Pure gold grams (24K equivalent)
 */
const toPureGoldGrams = (grams, purity) => {
    const g = Number(grams) || 0;
    if (g <= 0) return 0;
    return (g * parseKarat(purity)) / 24;
};

/**
 * Convert canonical Fine Gold (24K) into required product purity:
 * ProductGrams = PureGrams * (24 / ProductKarat)
 *
 * @param {number} pureGrams
 * @param {string|number} targetPurity
 * @returns {number} Equivalent grams in target purity
 */
const fromPureGoldGrams = (pureGrams, targetPurity) => {
    const pg = Number(pureGrams) || 0;
    if (pg <= 0) return 0;
    const k = parseKarat(targetPurity);
    if (k <= 0) return 0;
    return (pg * 24) / k;
};

module.exports = {
    parseKarat,
    convertGoldQuantity,
    toPureGoldGrams,
    fromPureGoldGrams
};
