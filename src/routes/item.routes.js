const express = require('express');
const itemController = require('../controllers/item.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public endpoint: Ingestion from Android, telemetry, or external sensors
router.post('/', itemController.createItem);

// Protected endpoints
router.get('/', authenticateToken, itemController.getAllItems);
router.delete('/all', authenticateToken, itemController.deleteAllItems);
router.delete('/', authenticateToken, itemController.deleteAllItems);
router.get('/:id', authenticateToken, itemController.getItemById);
router.delete('/:id', authenticateToken, itemController.deleteItemById);

module.exports = router;
