const { AppError } = require('../errors');
const { config } = require('../config/env');

/**
 * Catches malformed JSON payloads sent in HTTP body
 */
function handleJsonSyntaxError(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON payload in request body.'
    });
  }
  next(err);
}

/**
 * 404 Handler for undefined routes
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl}`
  });
}

/**
 * Global Error Handler returning structured JSON responses
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || (err.status && typeof err.status === 'number' ? err.status : 500);
  const message = err.message || 'Internal Server Error';

  if (config.NODE_ENV !== 'production') {
    console.error(`[Error] [${req.method} ${req.originalUrl}]:`, err);
  }

  return res.status(statusCode).json({
    success: false,
    error: message,
    ...(err.details && { details: err.details })
  });
}

module.exports = {
  handleJsonSyntaxError,
  notFoundHandler,
  errorHandler
};
