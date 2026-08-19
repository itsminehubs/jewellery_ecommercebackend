const prisma = require('../../config/prisma');
const logger = require('../../utils/logger');

/**
 * Update user loyalty points and tier
 * @param {string} userId
 * @param {number} amountPaid - Final amount spent
 * @returns {Promise<User>}
 */
const awardPointsPrisma = async (userId, amountPaid, tx = null) => {
    const pointsToAward = Math.floor(amountPaid / 1000);
    if (pointsToAward <= 0) return;

    const db = tx || prisma;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return;

    // Reset daily points if it's a new day
    const today = new Date().setHours(0, 0, 0, 0);
    const lastUpdate = user.lastPointsUpdateDate ? new Date(user.lastPointsUpdateDate).setHours(0, 0, 0, 0) : 0;

    let dailyPointsEarned = user.dailyPointsEarned || 0;
    
    if (today > lastUpdate) {
        dailyPointsEarned = 0;
    }

    // Enforce daily cap (e.g., 500 points per day to prevent abuse)
    const DAILY_CAP = 500;
    const remainingCap = Math.max(0, DAILY_CAP - dailyPointsEarned);
    const actualPointsToAward = Math.min(pointsToAward, remainingCap);

    if (actualPointsToAward <= 0) {
        logger.warn(`User ${userId} reached daily loyalty cap. Points ignored.`);
        return user;
    }

    const newPoints = (user.loyaltyPoints || 0) + actualPointsToAward;
    const newDailyPoints = dailyPointsEarned + actualPointsToAward;

    let loyaltyTier = 'Silver';
    if (newPoints >= 500) loyaltyTier = 'Platinum';
    else if (newPoints >= 100) loyaltyTier = 'Gold';

    const updatedUser = await db.user.update({
        where: { id: userId },
        data: {
            loyaltyPoints: newPoints,
            dailyPointsEarned: newDailyPoints,
            loyaltyTier,
            lastPointsUpdateDate: new Date()
        }
    });

    logger.info(`Awarded ${actualPointsToAward} points to user ${userId}. New balance: ${updatedUser.loyaltyPoints}`);
    return updatedUser;
};

// Aliased for backward compatibility if other places call it `awardPoints`
const awardPoints = awardPointsPrisma;

/**
 * Deduct user loyalty points
 */
const deductPoints = async (userId, amountRefunded, tx = null) => {
    const pointsToDeduct = Math.floor(amountRefunded / 1000);
    if (pointsToDeduct <= 0) return;

    const db = tx || prisma;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const newPoints = Math.max(0, (user.loyaltyPoints || 0) - pointsToDeduct);

    let loyaltyTier = user.loyaltyTier;
    if (newPoints < 100) loyaltyTier = 'Silver';
    else if (newPoints < 500) loyaltyTier = 'Gold';

    const updatedUser = await db.user.update({
        where: { id: userId },
        data: { loyaltyPoints: newPoints, loyaltyTier }
    });

    logger.info(`Deducted ${pointsToDeduct} points from user ${userId}. New balance: ${updatedUser.loyaltyPoints}`);
    return updatedUser;
};

/**
 * Redeem loyalty points
 */
const redeemPoints = async (userId, pointsToRedeem, tx = null) => {
    const db = tx || prisma;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || (user.loyaltyPoints || 0) < pointsToRedeem) {
        throw new Error('Insufficient points');
    }

    const discountAmount = pointsToRedeem * 10;
    const newPoints = user.loyaltyPoints - pointsToRedeem;

    let loyaltyTier = user.loyaltyTier;
    if (newPoints < 100) loyaltyTier = 'Silver';
    else if (newPoints < 500) loyaltyTier = 'Gold';

    await db.user.update({
        where: { id: userId },
        data: { loyaltyPoints: newPoints, loyaltyTier }
    });

    logger.info(`User ${userId} redeemed ${pointsToRedeem} points for ₹${discountAmount} discount`);
    return discountAmount;
};

module.exports = {
    awardPointsPrisma,
    awardPoints,
    deductPoints,
    redeemPoints
};
