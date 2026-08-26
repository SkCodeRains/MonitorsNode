const http = require('http');
const app = require('./src/app');
const { config } = require('./src/config/env');
const { connectDB, disconnectDB } = require('./src/config/db');
const { initWebSocketServer } = require('./src/sockets/socketServer');

// Export app for Vercel Serverless Function deployment
module.exports = app;

// Start server when executed directly (node server.js or nodemon)
if (require.main === module) {
  const server = http.createServer(app);
  const wss = initWebSocketServer(server);

  // Attempt initial database connection on boot
  if (config.MONGODB_URI) {
    connectDB().catch(err => {
      console.warn(`[MongoDB Notice] Initial connect failed: ${err.message}`);
    });
  }

  server.listen(config.PORT, () => {
    console.log(`Server is running on http://localhost:${config.PORT}`);
    if (wss) {
      console.log(`WebSocket server listening on ws://localhost:${config.PORT}`);
    }
    console.log(`MongoDB Atlas Database: "${config.DB_NAME}"`);
    console.log(`Public POST endpoint: http://localhost:${config.PORT}/api/data`);
    console.log(`Default Auth User: ${config.DEFAULT_USER.email}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERROR] Port ${config.PORT} is already in use!`);
      console.error(`Please stop any other running instance on port ${config.PORT} or change the PORT in .env file.\n`);
    } else {
      console.error('Server failed to start:', err);
    }
  });

  // Graceful shutdown handling
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      console.log('Server closed successfully.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
