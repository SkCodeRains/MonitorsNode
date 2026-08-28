const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { validateApiKey } = require('../middlewares/apiKey.middleware');

const router = express.Router();

router.post('/login', authController.login);
router.get('/me', validateApiKey, authenticateToken, authController.getMe);

module.exports = router;

