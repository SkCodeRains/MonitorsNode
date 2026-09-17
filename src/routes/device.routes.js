const express = require('express');
const deviceController = require('../controllers/device.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { validateApiKey } = require('../middlewares/apiKey.middleware');

const router = express.Router();

// Protected endpoint to retrieve device list (used by Frontend)
router.get('/', validateApiKey, authenticateToken, deviceController.getDevices);

module.exports = router;
