const { isDbConnected } = require('../config/db');
const { config } = require('../config/env');
const itemRepository = require('../repositories/item.repository');
const websocketService = require('../services/websocket.service');
const { asyncHandler } = require('../utils/asyncHandler');

const getHealthStatus = asyncHandler(async (req, res) => {
  const totalStoredItems = await itemRepository.count();
  const dbReady = isDbConnected();

  return res.status(200).json({
    name: 'MongoDB Atlas & Express REST API',
    status: 'Online',
    timestamp: new Date().toISOString(),
    database: {
      status: dbReady ? 'Connected (Atlas)' : (config.MONGODB_URI ? 'Connecting / Fallback' : 'In-Memory Mode'),
      name: config.DB_NAME
    },
    totalStoredItems,
    connectedWebSocketClients: websocketService.getConnectedClientCount(),
    auth: {
      loginEndpoint: 'POST /api/auth/login',
      defaultEmail: config.DEFAULT_USER.email
    }
  });
});

module.exports = { getHealthStatus };
