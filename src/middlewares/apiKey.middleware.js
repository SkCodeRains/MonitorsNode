const { config } = require('../config/env');

/**
 * Middleware to validate incoming requests for the x-api-key header
 */
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.get('x-api-key') || req.headers['api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Missing x-api-key header.'
    });
  }

  if (apiKey !== config.API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Invalid API key provided in x-api-key header.'
    });
  }

  next();
}

module.exports = { validateApiKey };
