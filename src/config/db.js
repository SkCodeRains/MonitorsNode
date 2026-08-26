const mongoose = require('mongoose');
const { config } = require('./env');

// Disable Mongoose command buffering so queries don't hang if Atlas is connecting
mongoose.set('bufferCommands', false);

// Global connection caching for serverless environments (Vercel / AWS Lambda)
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Connects to MongoDB Atlas with serverless connection caching and failover timeouts
 */
async function connectDB() {
  if (!config.MONGODB_URI) {
    return null;
  }
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }
  if (!cached.promise) {
    const opts = {
      dbName: config.DB_NAME,
      bufferCommands: false,
      serverSelectionTimeoutMS: 4000,
      connectTimeoutMS: 4000,
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
      heartbeatFrequencyMS: 10000
    };
    cached.promise = mongoose.connect(config.MONGODB_URI, opts).then((mongooseInstance) => {
      console.log(`[MongoDB] Connected successfully to Atlas Cluster (Database: "${config.DB_NAME}")`);
      return mongooseInstance;
    });
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.warn('[MongoDB] Connection warning/error:', e.message);
  }
  return cached.conn;
}

/**
 * Returns whether MongoDB connection is actively open
 */
function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Cleanly disconnects database during server shutdown
 */
async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
    console.log('[MongoDB] Disconnected cleanly');
  }
}

module.exports = {
  connectDB,
  isDbConnected,
  disconnectDB,
  mongoose
};
