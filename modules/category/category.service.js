const prisma = require('../../config/prisma');
const slugify = require('slugify');
const { uploadImage, deleteImage } = require('../../config/s3');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');

const getAllCategories = async (query = {}) => {
    const where = {};
    if (query.isActive !== undefined) {
        where.isActive = query.isActive === 'true' || query.isActive === true;
    }

    if (query.page && query.limit) {
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 10;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.category.findMany({
                where,
                skip,
                take: limit,
                orderBy: [
                    { order: 'asc' },
                    { name: 'asc' }
                ]
            }),
            prisma.category.count({ where })
        ]);
        return { items, total, page, limit };
    }

    return await prisma.category.findMany({
        where,
        orderBy: [
            { order: 'asc' },
            { name: 'asc' }
        ]
    });
};

const getCategoryById = async (id) => {
    const category = await prisma.category.findUnique({
        where: { id }
    });
    if (!category) throw ApiError.notFound('Category not found');
    return category;
};

const createCategory = async (categoryData, file) => {
    const { name, description, order, isActive } = categoryData;

    const existing = await prisma.category.findFirst({ where: { name } });
    if (existing) throw ApiError.conflict('Category already exists');

    const slug = slugify(name, { lower: true });

    let imageUrl = null;
    let imagePublicId = null;

    if (file) {
        const uploadResult = await uploadImage(file.path, 'categories');
        imageUrl = uploadResult.url;
        imagePublicId = uploadResult.public_id;
    }

    const category = await prisma.category.create({
        data: {
            name,
            slug,
            description,
            order: order !== undefined ? Number(order) : 0,
            isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
            imageUrl,
            imagePublicId
        }
    });

    logger.info(`Category created: ${category.name}`);
    return category;
};

const updateCategory = async (id, categoryData, file) => {
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) throw ApiError.notFound('Category not found');

    const dataToUpdate = {};

    if (categoryData.name && categoryData.name !== category.name) {
        const existing = await prisma.category.findFirst({ where: { name: categoryData.name } });
        if (existing) throw ApiError.conflict('Category name already exists');
        dataToUpdate.name = categoryData.name;
        dataToUpdate.slug = slugify(categoryData.name, { lower: true });
    }

    if (categoryData.description !== undefined) dataToUpdate.description = categoryData.description;
    if (categoryData.order !== undefined) dataToUpdate.order = Number(categoryData.order);
    if (categoryData.isActive !== undefined) dataToUpdate.isActive = (categoryData.isActive === 'true' || categoryData.isActive === true);

    if (file) {
        // Delete old image if exists
        if (category.imagePublicId) {
            await deleteImage(category.imagePublicId);
        }

        const uploadResult = await uploadImage(file.path, 'categories');
        dataToUpdate.imageUrl = uploadResult.url;
        dataToUpdate.imagePublicId = uploadResult.public_id;
    } else if (categoryData.removeImage === 'true' && category.imagePublicId) {
        await deleteImage(category.imagePublicId);
        dataToUpdate.imageUrl = null;
        dataToUpdate.imagePublicId = null;
    }

    const updatedCategory = await prisma.category.update({
        where: { id },
        data: dataToUpdate
    });

    logger.info(`Category updated: ${id}`);
    return updatedCategory;
};

const deleteCategory = async (id) => {
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) throw ApiError.notFound('Category not found');

    const productCount = await prisma.product.count({
        where: { categoryId: id }
    });

    if (productCount > 0) {
        throw ApiError.badRequest('Cannot delete category because it has products associated with it. Please reassign or delete the products first.');
    }

    // Delete image from Cloudinary
    if (category.imagePublicId) {
        await deleteImage(category.imagePublicId);
    }

    await prisma.category.delete({ where: { id } });
    logger.info(`Category deleted: ${id}`);
};

module.exports = {
    getAllCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory
};

