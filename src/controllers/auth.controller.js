const authService = require('../services/auth.service');
const { asyncHandler } = require('../utils/asyncHandler');

const login = asyncHandler(async (req, res) => {
  const { email, password, apiKey: bodyApiKey } = req.body || {};
  const headerApiKey = req.headers['x-api-key'] || req.get('x-api-key') || req.headers['api-key'];
  const apiKey = headerApiKey || bodyApiKey;

  const result = await authService.login(email, password, apiKey);

  return res.status(200).json({
    success: true,
    message: 'Login successful',
    token: result.token,
    user: result.user
  });
});


const getMe = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user
  });
});

module.exports = {
  login,
  getMe
};
