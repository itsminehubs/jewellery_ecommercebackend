const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const routes = require('./routes');

const {
  errorConverter,
  errorHandler,
  notFound,
  handleValidationError,
  handleJWTError,
  handleMulterError
} = require('./middlewares/error.middleware');

const { apiLimiter, redisRateLimiter } = require('./middlewares/rateLimiter.middleware');
const logger = require('./utils/logger');

const app = express();

// Trust proxy
app.set('trust proxy', 1);

// Security
const allowedOrigins = [
  "http://thecarbonsmith.com",
  "https://thecarbonsmith.com",
  "http://www.thecarbonsmith.com",
  "https://www.thecarbonsmith.com",
  ...(process.env.CORS_ORIGINS || "").split(",").map(origin => origin.trim()).filter(Boolean)
];

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Reflect the requesting origin automatically to prevent CORS errors on any deployed frontend/POS
    callback(null, true);
  },
  credentials: true
}));

// Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
app.use(
  morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) }
  })
);

// Custom logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.logRequest(req, res, Date.now() - start);
  });
  next();
});

// Health check (Enterprise Edition)
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    system: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      workerId: process.pid,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100} MB`,
      },
      nodeVersion: process.version,
      platform: process.platform
    }
  });
});

// Routes
const mainLimiter = process.env.NODE_ENV === 'production'
  ? redisRateLimiter({
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    keyPrefix: 'main'
  })
  : apiLimiter;

app.use('/api/v1', mainLimiter, routes);

// 404
app.use(notFound);

// Errors
app.use(handleValidationError);
app.use(handleJWTError);
app.use(handleMulterError);
app.use(errorConverter);
app.use(errorHandler);

module.exports = app;
