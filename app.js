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

const { apiLimiter } = require('./middlewares/rateLimiter.middleware');
const logger = require('./utils/logger');

const app = express();

// Trust proxy
app.set('trust proxy', 1);

// Security
app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));

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

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/v1', apiLimiter, routes);

// 404
app.use(notFound);

// Errors
app.use(handleValidationError);
app.use(handleJWTError);
app.use(handleMulterError);
app.use(errorConverter);
app.use(errorHandler);

module.exports = app;
