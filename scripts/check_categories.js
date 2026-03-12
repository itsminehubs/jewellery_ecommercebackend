const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Product = mongoose.connection.collection('products');
        const categories = await Product.distinct('category');
        console.log('Unique categories in products:', JSON.stringify(categories));

        const Category = mongoose.connection.collection('categories');
        const allCats = await Category.find({}).toArray();
        console.log('Categories in dynamic system:', JSON.stringify(allCats.map(c => ({ name: c.name, slug: c.slug }))));

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
};

check();
