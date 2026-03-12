const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config();

// Define Product Schema locally to avoid dependency issues during script execution
const ProductSchema = new mongoose.Schema({
    name: String,
    category: String,
    metalType: String,
    sku: { type: String, unique: true }
}, { strict: false });

const Product = mongoose.model('Product', ProductSchema);

const migrate = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI not found in environment');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all products that don't have an SKU or have an empty SKU
        const products = await Product.find({
            $or: [
                { sku: { $exists: false } },
                { sku: '' },
                { sku: null }
            ]
        });

        console.log(`Found ${products.length} products needing SKU migration.`);

        for (let i = 0; i < products.length; i++) {
            const product = products[i];

            const categoryCode = (product.category || 'GEN').substring(0, 2).toUpperCase();
            const metalCode = (product.metalType || 'GEN').substring(0, 3).toUpperCase();

            // Use index + current count to generate a unique sequence for migration
            const count = await Product.countDocuments({ sku: { $exists: true, $ne: null } }) + 1;
            const sequence = count.toString().padStart(4, '0');

            const newSku = `${categoryCode}-${metalCode}-${sequence}`;

            await Product.updateOne({ _id: product._id }, { $set: { sku: newSku } });
            console.log(`[${i + 1}/${products.length}] Updated "${product.name}" with SKU: ${newSku}`);
        }

        console.log('Migration completed successfully.');
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
