const Category = require('./category.model');
const slugify = require('slugify');
const { uploadImage, deleteImage } = require('../../config/cloudinary');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

const getAllCategories = async (query = {}) => {
    return await Category.find(query).sort('order name');
};

const getCategoryById = async (id) => {
    const category = await Category.findById(id);
    if (!category) throw ApiError.notFound('Category not found');
    return category;
};

const createCategory = async (categoryData, file) => {
    const { name, description, order, isActive } = categoryData;

    const existing = await Category.findOne({ name });
    if (existing) throw ApiError.conflict('Category already exists');

    const slug = slugify(name, { lower: true });

    let image;
    if (file) {
        const uploadResult = await uploadImage(file.path, 'categories');
        image = {
            url: uploadResult.secure_url,
            public_id: uploadResult.public_id
        };
    }

    const category = await Category.create({
        name,
        slug,
        description,
        order: order || 0,
        isActive: isActive !== undefined ? isActive : true,
        image
    });

    logger.info(`Category created: ${category.name}`);
    return category;
};

const updateCategory = async (id, categoryData, file) => {
    const category = await Category.findById(id);
    if (!category) throw ApiError.notFound('Category not found');

    if (categoryData.name && categoryData.name !== category.name) {
        const existing = await Category.findOne({ name: categoryData.name });
        if (existing) throw ApiError.conflict('Category name already exists');
        category.name = categoryData.name;
        category.slug = slugify(categoryData.name, { lower: true });
    }

    if (categoryData.description !== undefined) category.description = categoryData.description;
    if (categoryData.order !== undefined) category.order = categoryData.order;
    if (categoryData.isActive !== undefined) category.isActive = categoryData.isActive;

    if (file) {
        // Delete old image if exists
        if (category.image && category.image.public_id) {
            await deleteImage(category.image.public_id);
        }

        const uploadResult = await uploadImage(file.path, 'categories');
        category.image = {
            url: uploadResult.secure_url,
            public_id: uploadResult.public_id
        };
    } else if (categoryData.removeImage === 'true' && category.image && category.image.public_id) {
        await deleteImage(category.image.public_id);
        category.image = undefined;
    }

    await category.save();
    logger.info(`Category updated: ${category._id}`);
    return category;
};

const deleteCategory = async (id) => {
    const category = await Category.findById(id);
    if (!category) throw ApiError.notFound('Category not found');

    // Delete image from Cloudinary
    if (category.image && category.image.public_id) {
        await deleteImage(category.image.public_id);
    }

    await category.deleteOne();
    logger.info(`Category deleted: ${id}`);
};

module.exports = {
    getAllCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory
};
