const productService = require('./product.service');
const ApiResponse = require('../../utils/ApiResponse');
const { asyncHandler } = require('../../middlewares/error.middleware');

const getAllProducts = asyncHandler(async (req, res) => {
  const filters = {};
  const options = req.query;
  
  const result = await productService.getAllProducts(filters, options);
  ApiResponse.paginated(result.products, result.page, result.limit, result.total).send(res);
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  ApiResponse.success(product, 'Product fetched successfully').send(res);
});

const createProduct = asyncHandler(async (req, res) => {
  const imagePaths = req.files ? req.files.map(f => f.path) : [];
  const product = await productService.createProduct(req.body, imagePaths);
  ApiResponse.created(product, 'Product created successfully').send(res);
});

const updateProduct = asyncHandler(async (req, res) => {
  const imagePaths = req.files ? req.files.map(f => f.path) : [];
  const product = await productService.updateProduct(req.params.id, req.body, imagePaths);
  ApiResponse.success(product, 'Product updated successfully').send(res);
});

const deleteProduct = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);
  ApiResponse.success(null, 'Product deleted successfully').send(res);
});
const getProductsByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params;
  const options = req.query;

  const result = await productService.getProductsByCategory(category, options);

  ApiResponse.paginated(
    result.products,
    result.page,
    result.limit,
    result.total,
    `Products fetched for category: ${category}`
  ).send(res);
});
const getFeaturedProducts = asyncHandler(async (req, res) => {
  const options = req.query;

  const result = await productService.getFeaturedProducts(options);

  ApiResponse.paginated(
    result.products,
    result.page,
    result.limit,
    result.total,
    'Featured products fetched successfully'
  ).send(res);
});

const getTrendingProducts = asyncHandler(async (req, res) => {
  const options = req.query;

  const result = await productService.getTrendingProducts(options);

  ApiResponse.paginated(
    result.products,
    result.page,
    result.limit,
    result.total,
    'Trending products fetched successfully'
  ).send(res);
});

module.exports = {
  getAllProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  getFeaturedProducts,
  getTrendingProducts
};