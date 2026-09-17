const express = require('express');
const authRoutes = require('./auth.routes');
const itemRoutes = require('./item.routes');
const exclusionRoutes = require('./exclusion.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/data', itemRoutes);
router.use('/items', itemRoutes);
router.use('/exclusions', exclusionRoutes);

module.exports = router;
