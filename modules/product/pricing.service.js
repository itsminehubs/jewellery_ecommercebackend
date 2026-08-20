const prisma = require('../../config/prisma');

const roundTo2 = (num) => Number((Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2));

/**
 * Calculate dynamic pricing for a product
 * Takes in product data (including nested relations data) and computes the final price
 */
const calculateProductPrice = async (productData, metalDetails, stoneDetails) => {
    let price = 0;
    let finalPrice = 0;

    const grossWeight = metalDetails?.grossWeight ? Number(metalDetails.grossWeight) : 0;
    
    let totalStoneWeight = 0;
    let dynamicStoneValue = 0;

    // 1. Calculate Stone Weight and Value Dynamically
    if (stoneDetails && stoneDetails.length > 0) {
        for (let stone of stoneDetails) {
            let caratVal = stone.carat ? parseFloat(stone.carat) : 0;
            
            if (caratVal > 0) {
                stone.netWeight = roundTo2(caratVal * 0.200);
            }

            const stoneWeightGrams = stone.netWeight ? Number(stone.netWeight) : 0;
            totalStoneWeight += stoneWeightGrams;

            let rate = stone.rate ? Number(stone.rate) : 0;

            if (stone.stoneType === 'Diamond') {
                const query = {
                    cut: stone.cut || 'All',
                    color: stone.color || 'All',
                    clarity: stone.clarity || 'All'
                };
                
                let diamondRateDoc = await prisma.diamondRate.findFirst({
                    where: query,
                    orderBy: { effectiveDate: 'desc' }
                });

                if (!diamondRateDoc) {
                    diamondRateDoc = await prisma.diamondRate.findFirst({
                        where: { cut: 'All', color: 'All', clarity: 'All' },
                        orderBy: { effectiveDate: 'desc' }
                    });
                }

                if (diamondRateDoc) {
                    rate = Number(diamondRateDoc.ratePerCarat);
                    stone.rate = rate;
                }
                
                const calculationCarat = caratVal > 0 ? caratVal : (stoneWeightGrams / 0.200);
                dynamicStoneValue += calculationCarat * rate;
            } else {
                if (caratVal > 0) {
                    dynamicStoneValue += caratVal * rate;
                } else {
                    dynamicStoneValue += stoneWeightGrams * rate;
                }
            }
        }
    }

    const manualStoneCharges = productData.stoneCharges ? Number(productData.stoneCharges) : 0;
    const stoneValue = roundTo2(dynamicStoneValue > 0 ? dynamicStoneValue : manualStoneCharges);

    // 2. Net Gold Weight
    const netWeight = roundTo2(Math.max(0, grossWeight - totalStoneWeight));
    if (metalDetails) {
        metalDetails.netWeight = netWeight;
    }

    let metalValue = 0;
    let latestRate = null;

    // 3. Fetch latest metal rate
    if (metalDetails && metalDetails.metalType && metalDetails.purity) {
        latestRate = await prisma.goldRate.findFirst({
            where: {
                metal: metalDetails.metalType.toLowerCase(),
                purity: {
                    equals: metalDetails.purity,
                    mode: 'insensitive'
                }
            },
            orderBy: { effectiveDate: 'desc' }
        });

        if (latestRate) {
            const ratePerGram = Number(latestRate.ratePerGram);
            const wastagePercent = productData.wastage ? Number(productData.wastage) : 0;
            const wastageWeight = netWeight * (wastagePercent / 100);
            const finalGoldWeight = netWeight + wastageWeight;
            metalValue = roundTo2(finalGoldWeight * ratePerGram);
        }
    }

    // 5. Calculate Making Charges & Apply Discount
    let makingValue = 0;
    const makingCharges = productData.makingCharges ? Number(productData.makingCharges) : 0;
    if (productData.makingChargeType === 'per_gram') {
        makingValue = makingCharges * grossWeight;
    } else {
        makingValue = makingCharges; 
    }

    const discount = productData.discount ? Number(productData.discount) : 0;
    let discountedMakingValue = makingValue - (makingValue * (discount / 100));
    discountedMakingValue = roundTo2(discountedMakingValue);

    // 6. GST Split (3% Metal, 5% Making (on discounted), 0.25% Stones)
    const gst = roundTo2(
        (metalValue * 0.03) +
        (discountedMakingValue * 0.05) +
        (stoneValue * 0.0025)
    );

    // 7. Subtotal and Totals
    const subtotal = roundTo2(metalValue + discountedMakingValue + stoneValue);
    const totalCalculatedPrice = roundTo2(subtotal + gst);

    if (subtotal > 0) {
        price = Math.round(totalCalculatedPrice);
        finalPrice = Math.round(totalCalculatedPrice);
    }

    return {
        price,
        finalPrice,
        metalDetails,
        stoneDetails
    };
};

/**
 * Called by gold-rate service when rates are updated
 */
const recalculatePricesForMetal = async (metal, purity) => {
    // Find all products matching the metal and purity
    const products = await prisma.product.findMany({
        where: {
            metalDetails: {
                metalType: { equals: metal, mode: 'insensitive' },
                purity: purity
            }
        },
        include: { metalDetails: true, stoneDetails: true }
    });

    for (const product of products) {
        const { price, finalPrice, metalDetails, stoneDetails } = await calculateProductPrice(product, product.metalDetails, product.stoneDetails);
        
        await prisma.product.update({
            where: { id: product.id },
            data: {
                price,
                finalPrice,
                metalDetails: {
                    update: {
                        netWeight: metalDetails.netWeight
                    }
                }
            }
        });
    }
    
    console.log(`Recalculated prices for ${products.length} products with ${metal} ${purity}`);
};

/**
 * Called by diamond-rate service when rates are updated
 */
const recalculatePricesForDiamond = async (diamondRate) => {
    // For simplicity, fetch all products that have diamond stones
    const products = await prisma.product.findMany({
        where: {
            stoneDetails: {
                some: { stoneType: 'Diamond' }
            }
        },
        include: { metalDetails: true, stoneDetails: true }
    });

    for (const product of products) {
        const { price, finalPrice, metalDetails, stoneDetails } = await calculateProductPrice(product, product.metalDetails, product.stoneDetails);
        
        await prisma.product.update({
            where: { id: product.id },
            data: {
                price,
                finalPrice,
                metalDetails: {
                    update: {
                        netWeight: metalDetails.netWeight
                    }
                },
                // Update stone details rates if changed
                stoneDetails: {
                    update: stoneDetails.map(stone => ({
                        where: { id: stone.id },
                        data: {
                            netWeight: stone.netWeight,
                            rate: stone.rate
                        }
                    }))
                }
            }
        });
    }
    
    console.log(`Recalculated prices for ${products.length} diamond products`);
};

module.exports = {
    calculateProductPrice,
    recalculatePricesForMetal,
    recalculatePricesForDiamond
};
