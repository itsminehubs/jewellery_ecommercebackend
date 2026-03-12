/**
 * Application Constants
 */

// User Roles
const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  STAFF: 'staff',
  MODERATOR: 'moderator'
};

// Order Status
const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  PACKED: 'packed',
  SHIPPED: 'shipped',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  RETURNED: 'returned',
  REFUNDED: 'refunded'
};

// Payment Status
const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled'
};

// Payment Methods
const PAYMENT_METHODS = {
  RAZORPAY: 'razorpay',
  COD: 'cod',
  WALLET: 'wallet'
};

// Product Categories
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

// Metal Types
const METAL_TYPES = {
  GOLD: 'gold',
  SILVER: 'silver',
  PLATINUM: 'platinum',
  DIAMOND: 'diamond',
  ROSE_GOLD: 'rose_gold',
  WHITE_GOLD: 'white_gold'
};

// Gold Purity
const GOLD_PURITY = {
  KARAT_24: '24K',
  KARAT_22: '22K',
  KARAT_18: '18K',
  KARAT_14: '14K'
};

// Product Status
const PRODUCT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  OUT_OF_STOCK: 'out_of_stock',
  DISCONTINUED: 'discontinued'
};

// Banner Types
const BANNER_TYPES = {
  HOMEPAGE: 'homepage',
  OFFER: 'offer',
  PROMOTIONAL: 'promotional',
  FESTIVAL: 'festival'
};

// Banner Status
const BANNER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SCHEDULED: 'scheduled',
  EXPIRED: 'expired'
};

// Notification Types
const NOTIFICATION_TYPES = {
  ORDER_PLACED: 'order_placed',
  ORDER_CONFIRMED: 'order_confirmed',
  ORDER_SHIPPED: 'order_shipped',
  ORDER_DELIVERED: 'order_delivered',
  ORDER_CANCELLED: 'order_cancelled',
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAILED: 'payment_failed',
  PROMOTIONAL: 'promotional',
  PRICE_DROP: 'price_drop'
};

// OTP Types
const OTP_TYPES = {
  LOGIN: 'login',
  REGISTRATION: 'registration',
  RESET_PASSWORD: 'reset_password',
  VERIFY_EMAIL: 'verify_email',
  VERIFY_PHONE: 'verify_phone'
};

// Address Types
const ADDRESS_TYPES = {
  HOME: 'home',
  OFFICE: 'office',
  OTHER: 'other'
};

// Cart Item Status
const CART_STATUS = {
  ACTIVE: 'active',
  SAVED_FOR_LATER: 'saved_for_later'
};

// Wishlist Status
const WISHLIST_STATUS = {
  ACTIVE: 'active',
  REMOVED: 'removed'
};

// File Upload Limits
const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_FILES: 10,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
};

// Pagination
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};

// Cache Keys
const CACHE_KEYS = {
  PRODUCTS: 'products:',
  PRODUCT_DETAIL: 'product:',
  CATEGORIES: 'categories',
  BANNERS: 'banners:',
  USER: 'user:',
  CART: 'cart:',
  WISHLIST: 'wishlist:',
  OTP: 'otp:',
  REFRESH_TOKEN: 'refresh_token:',
  PRODUCT_VIEWS: 'product_views:'
};

// Cache TTL (in seconds)
const CACHE_TTL = {
  SHORT: 300,        // 5 minutes
  MEDIUM: 1800,      // 30 minutes
  LONG: 3600,        // 1 hour
  VERY_LONG: 86400,  // 24 hours
  OTP: 300           // 5 minutes
};

// Regex Patterns
const REGEX_PATTERNS = {
  PHONE: /^[6-9]\d{9}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PINCODE: /^[1-9][0-9]{5}$/,
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
};

// Error Messages
const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Resource not found',
  INVALID_CREDENTIALS: 'Invalid credentials',
  INVALID_OTP: 'Invalid or expired OTP',
  VALIDATION_ERROR: 'Validation error',
  DUPLICATE_ENTRY: 'Resource already exists',
  INTERNAL_ERROR: 'Internal server error',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable'
};

// Success Messages
const SUCCESS_MESSAGES = {
  OTP_SENT: 'OTP sent successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  REGISTRATION_SUCCESS: 'Registration successful',
  UPDATED_SUCCESS: 'Updated successfully',
  DELETED_SUCCESS: 'Deleted successfully',
  CREATED_SUCCESS: 'Created successfully'
};

// Date Formats
const DATE_FORMATS = {
  FULL: 'YYYY-MM-DD HH:mm:ss',
  DATE_ONLY: 'YYYY-MM-DD',
  TIME_ONLY: 'HH:mm:ss',
  DISPLAY: 'DD MMM YYYY',
  DISPLAY_WITH_TIME: 'DD MMM YYYY, hh:mm A'
};

// Queue Names
const QUEUE_NAMES = {
  EMAIL: 'email-queue',
  SMS: 'sms-queue',
  ORDER_STATUS: 'order-status-queue',
  NOTIFICATION: 'notification-queue'
};

// Email Templates
const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  ORDER_CONFIRMATION: 'order_confirmation',
  ORDER_SHIPPED: 'order_shipped',
  ORDER_DELIVERED: 'order_delivered',
  PAYMENT_SUCCESS: 'payment_success',
  RESET_PASSWORD: 'reset_password'
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};
// Invoice Status
const INVOICE_STATUS = {
  GENERATED: 'generated',
  SENT: 'sent',
  VIEWED: 'viewed',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
  VOID: 'void',
  DRAFT: 'draft'
};
module.exports = {
  INVOICE_STATUS,
  USER_ROLES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  PRODUCT_CATEGORIES,
  METAL_TYPES,
  GOLD_PURITY,
  PRODUCT_STATUS,
  BANNER_TYPES,
  BANNER_STATUS,
  NOTIFICATION_TYPES,
  OTP_TYPES,
  ADDRESS_TYPES,
  CART_STATUS,
  WISHLIST_STATUS,
  UPLOAD_LIMITS,
  PAGINATION,
  CACHE_KEYS,
  CACHE_TTL,
  REGEX_PATTERNS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  DATE_FORMATS,
  QUEUE_NAMES,
  EMAIL_TEMPLATES,
  HTTP_STATUS
};
