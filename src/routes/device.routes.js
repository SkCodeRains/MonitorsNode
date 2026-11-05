const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/device.controller');

router.get('/', deviceController.getDevices);
router.get('/:deviceId/usage-history', deviceController.getUsageHistory);
router.post('/:deviceId/data-usage', deviceController.updateDataUsage);
router.post('/:deviceId/app-usage', deviceController.updateAppUsage);

module.exports = router;
