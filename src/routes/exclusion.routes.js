const express = require('express');
const exclusionController = require('../controllers/exclusion.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { validateApiKey } = require('../middlewares/apiKey.middleware');

const router = express.Router();

// Public GET: Enables Android background sync, telemetry, and web dashboard to fetch exclusions
router.get('/', exclusionController.getAllExclusions);

// Protected endpoints for dashboard modifications
router.post('/', validateApiKey, authenticateToken, exclusionController.addExclusion);
router.delete('/:id', validateApiKey, authenticateToken, exclusionController.deleteExclusionById);

module.exports = router;
