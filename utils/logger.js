const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

/* -------------------------------------------------------------------------- */
/*                           ENSURE LOG DIRECTORY                              */
/* -------------------------------------------------------------------------- */

const logsDir = path.join(process.cwd(), 'logs');

try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err) {
  console.error('Failed to create logs directory:', err);
}

/* -------------------------------------------------------------------------- */
/*                               LOG FORMATS                                   */
/* -------------------------------------------------------------------------- */

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

/* -------------------------------------------------------------------------- */
/*                               TRANSPORTS                                    */
/* -------------------------------------------------------------------------- */

const transports = [];

try {
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info'
    }),
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error'
    })
  );
} catch (err) {
  console.error('File transport initialization failed:', err);
}

/* -------------------------------------------------------------------------- */
/*                             LOGGER INSTANCE                                 */
/* -------------------------------------------------------------------------- */

const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'jewelry-ecommerce-api' },
  transports,
  exceptionHandlers: [
    new winston.transports.Console()
  ],
  rejectionHandlers: [
    new winston.transports.Console()
  ],
  exitOnError: false
});

/* -------------------------------------------------------------------------- */
/*                             CONSOLE LOGGER                                  */
/* -------------------------------------------------------------------------- */

logger.add(
  new winston.transports.Console({
    format: consoleFormat
  })
);

/* -------------------------------------------------------------------------- */
/*                          CUSTOM LOGGER HELPERS                               */
/* -------------------------------------------------------------------------- */

logger.logRequest = (req, res, duration = 0) => {
  try {
    logger.info('HTTP Request', {
      method: req?.method,
      url: req?.originalUrl,
      statusCode: res?.statusCode,
      duration: `${duration}ms`,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      userId: req?.user?._id
    });
  } catch (err) {
    console.error('Request logging failed:', err);
  }
};

logger.logQuery = (operation, collection, duration = 0) => {
  try {
    logger.debug('Database Query', {
      operation,
      collection,
      duration: `${duration}ms`
    });
  } catch (err) {
    console.error('Query logging failed:', err);
  }
};

logger.createChild = (metadata = {}) => logger.child(metadata);

/* -------------------------------------------------------------------------- */

module.exports = logger;
