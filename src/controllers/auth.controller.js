const authService = require('../services/auth.service');
const { asyncHandler } = require('../utils/asyncHandler');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const result = await authService.login(email, password);

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
