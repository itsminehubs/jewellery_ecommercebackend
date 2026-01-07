/**
 * Standard API Response class
 */
class ApiResponse {
  /**
   * Create an API response
   * @param {number} statusCode - HTTP status code
   * @param {any} data - Response data
   * @param {string} message - Response message
   */
  constructor(statusCode, data, message = 'Success') {
    this.statusCode = statusCode;
    this.success = statusCode < 400;
    this.message = message;
    this.data = data;
  }

  /**
   * Create success response
   * @param {any} data - Response data
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code (default: 200)
   * @returns {ApiResponse}
   */
  static success(data = null, message = 'Success', statusCode = 200) {
    return new ApiResponse(statusCode, data, message);
  }

  /**
   * Create created response (201)
   * @param {any} data - Response data
   * @param {string} message - Success message
   * @returns {ApiResponse}
   */
  static created(data = null, message = 'Created successfully') {
    return new ApiResponse(201, data, message);
  }

  /**
   * Create no content response (204)
   * @param {string} message - Success message
   * @returns {ApiResponse}
   */
  static noContent(message = 'No content') {
    return new ApiResponse(204, null, message);
  }

  /**
   * Create paginated response
   * @param {Array} data - Response data array
   * @param {number} page - Current page
   * @param {number} limit - Items per page
   * @param {number} total - Total items count
   * @param {string} message - Response message
   * @returns {ApiResponse}
   */
  static paginated(data, page, limit, total, message = 'Success') {
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return new ApiResponse(200, {
      items: data,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage
      }
    }, message);
  }

  /**
   * Send response to client
   * @param {Object} res - Express response object
   * @returns {Object}
   */
  send(res) {
    return res.status(this.statusCode).json({
      success: this.success,
      message: this.message,
      data: this.data
    });
  }
}

module.exports = ApiResponse;
