const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

/**
 * Middleware to authenticate requests via JWT Bearer token
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Missing Bearer token in Authorization header.'
    });
  }

  jwt.verify(token, config.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired token. Please log in again.'
      });
    }
    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };
