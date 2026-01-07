# 💎 Jewelry E-Commerce Backend

A production-grade, scalable Node.js backend for jewelry e-commerce platform with complete order management, payment processing, and admin dashboard.

## 🚀 Features

### 🔐 Authentication
- Mobile OTP-based authentication (via Twilio)
- JWT access & refresh tokens
- Secure session management
- Role-based access control (User & Admin)

### 👤 User Features
- Profile management with multiple addresses
- Shopping cart with persistent storage
- Wishlist functionality
- Order placement and tracking
- Payment integration (Razorpay)
- Order history and cancellation

### 💎 Product Management
- Product CRUD operations
- Category and metal type filtering
- Search functionality
- Image upload (Cloudinary)
- Stock management
- Featured products
- Related products

### 📦 Order Management
- Complete order lifecycle
- Order status tracking (Pending → Paid → Confirmed → Packed → Shipped → Delivered)
- Order cancellation and refunds
- Shipping address management
- Order statistics

### 💳 Payment Processing
- Razorpay integration
- Secure payment verification
- Refund processing
- Payment history
- COD support

### 🖼️ Banner Management
- Homepage banners
- Festival/promotional banners
- Scheduled banner display
- Image management

### 📊 Admin Dashboard
- Order management
- Product management
- Payment tracking
- Sales statistics
- User management
- Banner management

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (LTS) |
| Framework | Express.js |
| Database | MongoDB (Mongoose) |
| Cache | Redis |
| Authentication | JWT + Refresh Token |
| Payment | Razorpay |
| Image Upload | Cloudinary |
| Validation | Joi |
| SMS/OTP | Twilio |
| Logger | Winston |

## 📁 Project Structure

```
backend/
├── src/
│   ├── app.js                 # Express app configuration
│   ├── server.js             # Server startup
│   ├── config/               # Configuration files
│   │   ├── db.js
│   │   ├── redis.js
│   │   ├── razorpay.js
│   │   ├── cloudinary.js
│   │   └── index.js
│   ├── modules/              # Feature modules
│   │   ├── auth/
│   │   ├── user/
│   │   ├── product/
│   │   ├── order/
│   │   ├── payment/
│   │   ├── banner/
│   │   └── admin/
│   ├── middlewares/          # Express middlewares
│   │   ├── auth.middleware.js
│   │   ├── admin.middleware.js
│   │   ├── error.middleware.js
│   │   ├── rateLimiter.middleware.js
│   │   └── upload.middleware.js
│   ├── utils/                # Utility functions
│   │   ├── ApiError.js
│   │   ├── ApiResponse.js
│   │   ├── logger.js
│   │   ├── jwt.js
│   │   ├── hash.js
│   │   └── constants.js
│   ├── routes/               # Route definitions
│   │   └── index.js
│   └── validations/          # Request validations
├── logs/                     # Application logs
├── uploads/                  # Temporary uploads
├── .env                      # Environment variables
├── .gitignore
├── package.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 5.0
- Redis >= 6.0
- npm >= 9.0.0

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` file with your credentials:
```env
# Server

PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/jewelry_ecommerce

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_super_secret_key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Razorpay
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_phone_number

# Frontend
FRONTEND_URL=http://localhost:3000
```

4. **Start MongoDB and Redis**
```bash
# MongoDB
mongod

# Redis
redis-server
```

5. **Run the application**
```bash
# Development
npm run dev

# Production
npm start
```

## 📡 API Endpoints

### Authentication
- `POST /api/v1/auth/send-otp` - Send OTP to mobile
- `POST /api/v1/auth/verify-otp` - Verify OTP and login
- `POST /api/v1/auth/register` - Complete registration
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `POST /api/v1/auth/logout` - Logout user

### User
- `GET /api/v1/users/profile` - Get user profile
- `PUT /api/v1/users/profile` - Update profile
- `POST /api/v1/users/addresses` - Add address
- `PUT /api/v1/users/addresses/:id` - Update address
- `DELETE /api/v1/users/addresses/:id` - Delete address
- `GET /api/v1/users/cart` - Get cart
- `POST /api/v1/users/cart` - Add to cart
- `PUT /api/v1/users/cart` - Update cart
- `DELETE /api/v1/users/cart/:productId` - Remove from cart
- `GET /api/v1/users/wishlist` - Get wishlist
- `POST /api/v1/users/wishlist` - Add to wishlist
- `DELETE /api/v1/users/wishlist/:productId` - Remove from wishlist

### Products
- `GET /api/v1/products` - Get all products (with filters)
- `GET /api/v1/products/featured` - Get featured products
- `GET /api/v1/products/:id` - Get product by ID
- `GET /api/v1/products/:id/related` - Get related products
- `POST /api/v1/products` - Create product (Admin)
- `PUT /api/v1/products/:id` - Update product (Admin)
- `DELETE /api/v1/products/:id` - Delete product (Admin)

### Orders
- `POST /api/v1/orders` - Create order
- `GET /api/v1/orders/my-orders` - Get user orders
- `GET /api/v1/orders/:id` - Get order details
- `POST /api/v1/orders/:id/cancel` - Cancel order
- `GET /api/v1/orders` - Get all orders (Admin)
- `PUT /api/v1/orders/:id/status` - Update order status (Admin)
- `PUT /api/v1/orders/:id/tracking` - Update tracking (Admin)

### Payments
- `POST /api/v1/payments/create-order` - Create Razorpay order
- `POST /api/v1/payments/verify` - Verify payment
- `POST /api/v1/payments/refund` - Process refund
- `GET /api/v1/payments/history` - Payment history (Admin)
- `GET /api/v1/payments/statistics` - Payment statistics (Admin)

### Banners
- `GET /api/v1/banners` - Get all banners
- `GET /api/v1/banners/:id` - Get banner by ID
- `POST /api/v1/banners` - Create banner (Admin)
- `PUT /api/v1/banners/:id` - Update banner (Admin)
- `DELETE /api/v1/banners/:id` - Delete banner (Admin)

## 🔒 Security Features

- Helmet.js for security headers
- CORS configuration
- Rate limiting
- MongoDB injection prevention
- XSS protection
- JWT token authentication
- Secure password hashing
- Input validation with Joi

## 📊 Performance Optimization

- Redis caching for frequently accessed data
- Database indexing
- Response compression
- Query optimization
- Connection pooling

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 📝 Environment Variables

See `.env.example` for all required environment variables.

## 🚢 Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start src/server.js --name jewelry-backend

# Monitor
pm2 monit

# View logs
pm2 logs jewelry-backend
```

### Docker Deployment

```bash
# Build image
docker build -t jewelry-backend .

# Run container
docker run -p 5000:5000 --env-file .env jewelry-backend
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 👥 Support

For support, email support@jewelrystore.com or open an issue in the repository.

---

**Built with ❤️ for Jewelry E-Commerce**