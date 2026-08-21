const categoryService = require('./category.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const getAllCategories = asyncHandler(async (req, res) => {
    const result = await categoryService.getAllCategories(req.query);
    if (req.query.page && req.query.limit) {
        return ApiResponse.paginated(result.items, result.page, result.limit, result.total, 'Categories fetched successfully').send(res);
    }
    ApiResponse.success(result, 'Categories fetched successfully').send(res);
});

const getCategory = asyncHandler(async (req, res) => {
    const category = await categoryService.getCategoryById(req.params.id);
    ApiResponse.success(category, 'Category fetched successfully').send(res);
});

const createCategory = asyncHandler(async (req, res) => {
    const category = await categoryService.createCategory(req.body, req.file);
    ApiResponse.created(category, 'Category created successfully').send(res);
});

const updateCategory = asyncHandler(async (req, res) => {
    const category = await categoryService.updateCategory(req.params.id, req.body, req.file);
    ApiResponse.success(category, 'Category updated successfully').send(res);
});

const deleteCategory = asyncHandler(async (req, res) => {
    await categoryService.deleteCategory(req.params.id);
    ApiResponse.success(null, 'Category deleted successfully').send(res);
});

module.exports = {
    getAllCategories,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory
};
