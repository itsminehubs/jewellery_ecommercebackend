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

// Trust proxy (important for nginx / load balancer)
app.set('trust proxy', 1);

// ============================
// ✅ CORS CONFIG (FIXED)
// ============================

const allowedOrigins = [
  "http://thecarbonsmith.com",
  "https://thecarbonsmith.com",
  "http://www.thecarbonsmith.com",
  "https://www.thecarbonsmith.com",
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean)
];

const corsOptions = {
  origin: function (origin, callback) {
    // allow Postman / mobile apps / server-to-server
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error(`CORS not allowed for: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-shop-id"],
  exposedHeaders: ["Content-Length"],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options(/(.*)/, cors(corsOptions)); // handle preflight

// ============================
// ✅ SECURITY
// ============================

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ============================
// ✅ BODY PARSERS
// ============================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================
// ✅ COMPRESSION
// ============================

app.use(compression());

// ============================
// ✅ LOGGING
// ============================

app.use(
  morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) }
  })
);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.logRequest(req, res, Date.now() - start);
  });
  next();
});

// ============================
// ✅ HEALTH CHECK
// ============================

app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();

  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    system: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      pid: process.pid,
      memory: {
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      },
      nodeVersion: process.version,
      platform: process.platform
    }
  });
});

// ============================
// ✅ RATE LIMITER
// ============================

const mainLimiter = process.env.NODE_ENV === 'production'
  ? redisRateLimiter({
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    keyPrefix: 'main'
  })
  : apiLimiter;

// ============================
// ✅ ROUTES
// ============================

app.use('/api/v1', mainLimiter, routes);

// ============================
// ❌ 404 HANDLER
// ============================

app.use(notFound);

// ============================
// ❌ ERROR HANDLERS
// ============================

app.use(handleValidationError);
app.use(handleJWTError);
app.use(handleMulterError);
app.use(errorConverter);
app.use(errorHandler);

module.exports = app;