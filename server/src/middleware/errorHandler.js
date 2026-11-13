/**
 * Centralized Application Error Handler
 */
const errorHandler = (err, req, res, next) => {
  console.error('[Error]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.originalUrl,
    method: req.method
  });

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details,
        timestamp: new Date().toISOString()
      }
    });
  }

  // MongoDB Unique Constraint Duplicate Key Error (e.g. E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'uniqueField';
    return res.status(409).json({
      error: {
        code: 'DUPLICATE_RESOURCE',
        message: `A record with this ${field} already exists.`,
        field,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Custom Application Errors
  const status = err.statusCode || err.status || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  return res.status(status).json({
    error: {
      code,
      message: err.message || 'An unexpected internal error occurred.',
      timestamp: new Date().toISOString()
    }
  });
};

module.exports = errorHandler;

