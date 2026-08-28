const express = require('express');
const itemController = require('../controllers/item.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { validateApiKey } = require('../middlewares/apiKey.middleware');

const router = express.Router();

// Public endpoint: Ingestion from Android, telemetry, or external sensors (NO auth / NO API key required)
router.post('/', itemController.createItem);

// Protected endpoints (Requires both x-api-key header and JWT Bearer token)
router.get('/', validateApiKey, authenticateToken, itemController.getAllItems);
router.delete('/all', validateApiKey, authenticateToken, itemController.deleteAllItems);
router.delete('/', validateApiKey, authenticateToken, itemController.deleteAllItems);
router.get('/:id', validateApiKey, authenticateToken, itemController.getItemById);
router.delete('/:id', validateApiKey, authenticateToken, itemController.deleteItemById);

module.exports = router;

