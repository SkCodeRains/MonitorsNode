const express = require('express');
const authRoutes = require('./auth.routes');
const itemRoutes = require('./item.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/data', itemRoutes);
router.use('/items', itemRoutes);

module.exports = router;
