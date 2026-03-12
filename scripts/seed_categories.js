const mongoose = require('mongoose');
const dotenv = require('dotenv');
const slugify = require('slugify');
const path = require('path');

// Load env vars
dotenv.config();

// Define Category Schema locally to avoid dependency issues
const CategorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Category = mongoose.model('Category', CategorySchema);

const PRODUCT_CATEGORIES = {
    RINGS: 'rings',
    NECKLACES: 'necklaces',
    EARRINGS: 'earrings',
    BANGLES: 'bangles',
    BRACELETS: 'bracelets',
    PENDANTS: 'pendants',
    CHAINS: 'chains',
    BRIDAL: 'bridal',
    MANGALSUTRA: 'mangalsutra',
    NOSE_PINS: 'nose_pins',
    ANKLETS: 'anklets'
};

const seed = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI not found in environment');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const categories = Object.values(PRODUCT_CATEGORIES);

        for (const catName of categories) {
            // Capitalize first letter for display name
            const displayName = catName.charAt(0).toUpperCase() + catName.slice(1).replace('_', ' ');
            const slug = slugify(displayName, { lower: true });

            const existing = await Category.findOne({ slug });
            if (!existing) {
                await Category.create({ name: displayName, slug });
                console.log(`Seeded category: ${displayName}`);
            } else {
                console.log(`Category ${displayName} already exists`);
            }
        }

        console.log('Seeding completed successfully.');
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
};

seed();
