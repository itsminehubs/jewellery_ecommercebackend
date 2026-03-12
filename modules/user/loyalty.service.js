const User = require('./user.model');
const logger = require('../../utils/logger');

/**
 * Update user loyalty points and tier
 * @param {string} userId
 * @param {number} amountPaid - Final amount spent
 * @returns {Promise<User>}
 */
const awardPoints = async (userId, amountPaid, session = null) => {
    const pointsToAward = Math.floor(amountPaid / 1000);
    if (pointsToAward <= 0) return;

    const user = await User.findById(userId).session(session);
    if (!user) return;

    // Reset daily points if it's a new day
    const today = new Date().setHours(0, 0, 0, 0);
    const lastUpdate = new Date(user.lastPointsUpdateDate).setHours(0, 0, 0, 0);

    if (today > lastUpdate) {
        user.dailyPointsEarned = 0;
        user.lastPointsUpdateDate = new Date();
    }

    // Enforce daily cap (e.g., 500 points per day to prevent abuse)
    const DAILY_CAP = 500;
    const remainingCap = Math.max(0, DAILY_CAP - user.dailyPointsEarned);
    const actualPointsToAward = Math.min(pointsToAward, remainingCap);

    if (actualPointsToAward <= 0) {
        logger.warn(`User ${userId} reached daily loyalty cap. Points ignored.`);
        return user;
    }

    user.loyaltyPoints += actualPointsToAward;
    user.dailyPointsEarned += actualPointsToAward;

    // Update tier
    if (user.loyaltyPoints >= 500) {
        user.loyaltyTier = 'Platinum';
    } else if (user.loyaltyPoints >= 100) {
        user.loyaltyTier = 'Gold';
    } else {
        user.loyaltyTier = 'Silver';
    }

    await user.save({ session });
    logger.info(`Awarded ${actualPointsToAward} points to user ${userId}. New balance: ${user.loyaltyPoints}`);
    return user;
};

/**
 * Deduct user loyalty points
 * @param {string} userId
 * @param {number} amountRefunded - Amount to deduct points for
 * @returns {Promise<User>}
 */
const deductPoints = async (userId, amountRefunded) => {
    const pointsToDeduct = Math.floor(amountRefunded / 1000);
    if (pointsToDeduct <= 0) return;

    const user = await User.findById(userId);
    if (!user) return;

    user.loyaltyPoints = Math.max(0, user.loyaltyPoints - pointsToDeduct);

    // Downgrade tier if necessary
    if (user.loyaltyPoints < 100) {
        user.loyaltyTier = 'Silver';
    } else if (user.loyaltyPoints < 500) {
        user.loyaltyTier = 'Gold';
    }

    await user.save();
    logger.info(`Deducted ${pointsToDeduct} points from user ${userId}. New balance: ${user.loyaltyPoints}`);
    return user;
};

/**
 * Redeem loyalty points
 * @param {string} userId
 * @param {number} pointsToRedeem
 * @returns {number} Discount amount (1 point = ₹10)
 */
const redeemPoints = async (userId, pointsToRedeem) => {
    const user = await User.findById(userId);
    if (!user || user.loyaltyPoints < pointsToRedeem) {
        throw new Error('Insufficient points');
    }

    const discountAmount = pointsToRedeem * 10;
    user.loyaltyPoints -= pointsToRedeem;

    // Update tier after redemption
    if (user.loyaltyPoints < 100) {
        user.loyaltyTier = 'Silver';
    } else if (user.loyaltyPoints < 500) {
        user.loyaltyTier = 'Gold';
    }

    await user.save();
    logger.info(`User ${userId} redeemed ${pointsToRedeem} points for ₹${discountAmount} discount`);
    return discountAmount;
};

module.exports = {
    awardPoints,
    deductPoints,
    redeemPoints
};
