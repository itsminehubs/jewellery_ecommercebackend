const mongoose = require('mongoose');
const dotenv = require('dotenv');
const slugify = require('slugify');

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const Category = mongoose.connection.collection('categories');
        const Product = mongoose.connection.collection('products');

        const allCategories = await Category.find({}).toArray();

        for (const cat of allCategories) {
            // Legacy categories might have underscores
            const legacyName = cat.slug.replace('-', '_');

            // Update products that use the legacy name
            if (legacyName !== cat.slug) {
                const result = await Product.updateMany(
                    { category: legacyName },
                    { $set: { category: cat.slug } }
                );
                console.log(`Updated ${result.modifiedCount} products from ${legacyName} to ${cat.slug}`);
            }
        }

        console.log('Product category migration completed.');
        await mongoose.disconnect();
    } catch (err) {
        console.error('Migration failed:', err);
    }
};

migrate();
