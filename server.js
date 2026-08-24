const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
require('dotenv').config();

const Item = require('./models/item.model');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'MONITOR_SUPER_SECRET_JWT_KEY_2026_PROD';
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.DB_NAME || 'monitor_db';

// Disable Mongoose command buffering so queries don't hang if Atlas is connecting
mongoose.set('bufferCommands', false);

// In-Memory fallback store for zero-latency operations even when MongoDB is connecting
let memoryStore = [];

// Global connection caching for serverless environments (Vercel / AWS Lambda)
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Ensures MongoDB Atlas connection is cached and reused across serverless invocations
 * Uses short timeouts (4000ms) to ensure fast failover without tripping Vercel serverless timeouts
 */
async function connectDB() {
  if (!MONGODB_URI) {
    return null;
  }
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }
  if (!cached.promise) {
    const opts = {
      dbName: DB_NAME,
      bufferCommands: false,
      serverSelectionTimeoutMS: 4000,
      connectTimeoutMS: 4000,
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
      heartbeatFrequencyMS: 10000
    };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then(async (mongooseInstance) => {
      console.log(`[MongoDB] Connected successfully to Atlas Cluster (Database: "${DB_NAME}")`);
      // Sync any items stored in memory into MongoDB Atlas
      if (memoryStore.length > 0) {
        try {
          for (const item of memoryStore) {
            await Item.findOneAndUpdate({ id: item.id }, item, { upsert: true, returnDocument: 'after' });
          }
          console.log(`[MongoDB] Synced ${memoryStore.length} in-memory item(s) to Atlas`);
        } catch (err) {
          console.warn('[MongoDB] Sync error:', err.message);
        }
      }
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

// Attempt initial connection on boot
if (MONGODB_URI) {
  connectDB().catch(err => {
    console.warn(`[MongoDB Notice] Initial connect failed: ${err.message}`);
  });
}

// User credentials (configurable via environment variables)
const DEFAULT_USER_EMAIL = process.env.DEFAULT_USER_EMAIL || 'skcoderains@gmail.com';
const DEFAULT_USER_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'CodeR@ins697972914439';
const DEFAULT_USER_NAME = process.env.DEFAULT_USER_NAME || 'CodeRains Admin';

const DEFAULT_USER = {
  id: 'usr_admin_01',
  email: DEFAULT_USER_EMAIL,
  name: DEFAULT_USER_NAME,
  passwordHash: bcrypt.hashSync(DEFAULT_USER_PASSWORD, 10)
};

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.options('*', cors());

// Middleware for parsing JSON and URL-encoded data with strict size limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware to catch malformed JSON payloads gracefully
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON payload in request body.'
    });
  }
  next(err);
});

// Create standard HTTP server wrapping Express
const server = http.createServer(app);

// Initialize WebSocket Server attached to the HTTP server
let wss = null;
try {
  wss = new WebSocketServer({ server });
} catch (err) {
  console.warn('[WebSocket] Warning initializing WebSocketServer:', err.message);
}

/**
 * Broadcast event message to all authenticated WebSocket clients
 */
function broadcast(event) {
  if (!wss || !wss.clients) return;
  const message = JSON.stringify(event);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.isAuthenticated !== false) {
      try {
        client.send(message);
      } catch (err) {
        console.warn('[WebSocket] Broadcast error to client:', err.message);
      }
    }
  });
}

/**
 * Helper to fetch all items with serverless resilience
 */
async function getAllItems() {
  await connectDB();
  if (mongoose.connection.readyState === 1) {
    try {
      const items = await Item.find().sort({ createdAt: -1 }).lean();
      return items.map(item => ({
        ...item,
        id: item.id || (item._id ? String(item._id) : crypto.randomUUID())
      }));
    } catch (err) {
      console.warn('[Storage] DB query failed, using memory store:', err.message);
    }
  }
  return [...memoryStore].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Handle WebSocket Client Connections (when running in persistent server environment)
if (wss) {
  wss.on('connection', async (ws, req) => {
    const clientIp = req.socket.remoteAddress;

    // Extract token from query params: ws://localhost:5000?token=...
    let token = null;
    if (req.url && req.url.includes('token=')) {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      token = urlParams.get('token');
    }

    // Validate initial token if present
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        ws.user = decoded;
        ws.isAuthenticated = true;
      } catch {
        ws.isAuthenticated = false;
      }
    } else {
      ws.isAuthenticated = false;
    }

    if (ws.isAuthenticated) {
      console.log(`[WebSocket] Authenticated client connected: ${ws.user.email} (${clientIp})`);
      const items = await getAllItems();
      ws.send(JSON.stringify({
        type: 'INITIAL_STATE',
        data: items,
        totalCount: items.length,
        timestamp: new Date().toISOString()
      }));
    } else {
      console.log(`[WebSocket] Anonymous client connected (${clientIp}) - awaiting auth`);
    }

    // Handle incoming messages from WebSocket clients
    ws.on('message', async (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage.toString());
        const action = payload.action || payload.type;

        // Handle Authentication over WebSocket
        if (action === 'AUTH') {
          const msgToken = payload.token;
          try {
            const decoded = jwt.verify(msgToken, JWT_SECRET);
            ws.user = decoded;
            ws.isAuthenticated = true;
            ws.send(JSON.stringify({
              type: 'AUTH_SUCCESS',
              user: { email: decoded.email, name: decoded.name }
            }));

            const items = await getAllItems();
            ws.send(JSON.stringify({
              type: 'INITIAL_STATE',
              data: items,
              totalCount: items.length,
              timestamp: new Date().toISOString()
            }));
            return;
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'AUTH_ERROR',
              error: 'Invalid or expired token'
            }));
            return;
          }
        }

        // Public or authenticated PING
        if (action === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          return;
        }

        // Remaining WS actions require authentication
        if (!ws.isAuthenticated) {
          ws.send(JSON.stringify({
            type: 'UNAUTHORIZED',
            error: 'Authentication required. Send { action: "AUTH", token: "<jwt>" }'
          }));
          return;
        }

        switch (action) {
          case 'GET_ALL': {
            const items = await getAllItems();
            ws.send(JSON.stringify({
              type: 'INITIAL_STATE',
              data: items,
              totalCount: items.length,
              timestamp: new Date().toISOString()
            }));
            break;
          }

          case 'CREATE':
          case 'POST_ITEM': {
            if (payload !== undefined && payload !== null) {
              const eventId = payload.id !== undefined && payload.id !== null ? String(payload.id) : crypto.randomUUID();
              const eventPayload = payload.payload !== undefined ? payload.payload : (payload.data !== undefined ? payload.data : payload);
              
              let createdAt = new Date();
              if (payload.timestamp) {
                const parsed = new Date(payload.timestamp);
                if (!isNaN(parsed.getTime())) createdAt = parsed;
              }

              const itemData = {
                id: eventId,
                ...payload,
                id: eventId,
                data: eventPayload,
                payload: eventPayload,
                createdAt: createdAt
              };

              // Update in-memory store
              const existingIndex = memoryStore.findIndex(i => i.id === eventId);
              if (existingIndex !== -1) {
                memoryStore[existingIndex] = itemData;
              } else {
                memoryStore.unshift(itemData);
              }

              // Persist to MongoDB Atlas if connected
              await connectDB();
              if (mongoose.connection.readyState === 1) {
                try {
                  await Item.findOneAndUpdate(
                    { id: eventId },
                    itemData,
                    { upsert: true, returnDocument: 'after' }
                  );
                } catch (err) {
                  console.warn('[MongoDB] Save error:', err.message);
                }
              }

              broadcast({
                type: 'ITEM_ADDED',
                item: itemData,
                totalCount: memoryStore.length,
                timestamp: new Date().toISOString()
              });
            }
            break;
          }

          case 'DELETE':
          case 'DELETE_ITEM': {
            if (payload.id) {
              const deleteId = String(payload.id);
              let deletedItem = null;

              await connectDB();
              if (mongoose.connection.readyState === 1) {
                try {
                  deletedItem = await Item.findOneAndDelete({ id: deleteId }).lean();
                } catch (err) {
                  console.warn('[MongoDB] Delete error:', err.message);
                }
              }

              if (!deletedItem) {
                deletedItem = memoryStore.find(i => i.id === deleteId);
              }
              memoryStore = memoryStore.filter(i => i.id !== deleteId);

              if (deletedItem) {
                broadcast({
                  type: 'ITEM_DELETED',
                  id: deleteId,
                  deletedItem: deletedItem,
                  remainingCount: memoryStore.length,
                  timestamp: new Date().toISOString()
                });
              }
            }
            break;
          }

          case 'DELETE_ALL': {
            let deletedCount = 0;
            await connectDB();
            if (mongoose.connection.readyState === 1) {
              try {
                const res = await Item.deleteMany({});
                deletedCount = res.deletedCount || 0;
              } catch (err) {
                console.warn('[MongoDB] DeleteAll error:', err.message);
              }
            } else {
              deletedCount = memoryStore.length;
            }
            memoryStore = [];

            broadcast({
              type: 'ALL_DELETED',
              deletedCount: deletedCount,
              remainingCount: 0,
              timestamp: new Date().toISOString()
            });
            break;
          }

          default:
            ws.send(JSON.stringify({
              type: 'UNKNOWN_ACTION',
              message: `Action "${action}" is not recognized.`
            }));
        }
      } catch (err) {
        console.error('[WebSocket] Error processing message:', err.message);
        ws.send(JSON.stringify({
          type: 'ERROR',
          error: 'Error processing request'
        }));
      }
    });

    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected (Remaining clients: ${wss.clients.size})`);
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Socket error:', err.message);
    });
  });
}

/**
 * Middleware: JWT Authentication
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Missing Bearer token in Authorization header.'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired token. Please log in again.'
      });
    }
    req.user = user;
    next();
  });
}

/**
 * Root Route - Service Health & API Documentation
 */
app.get('/', async (req, res) => {
  const items = await getAllItems();
  const dbReady = mongoose.connection.readyState === 1;
  return res.status(200).json({
    name: 'MongoDB Atlas & Express REST API',
    status: 'Online',
    timestamp: new Date().toISOString(),
    database: {
      status: dbReady ? 'Connected (Atlas)' : (MONGODB_URI ? 'Connecting / Fallback' : 'In-Memory Mode'),
      name: DB_NAME
    },
    totalStoredItems: items.length,
    connectedWebSocketClients: wss && wss.clients ? wss.clients.size : 0,
    auth: {
      loginEndpoint: 'POST /api/auth/login',
      defaultEmail: DEFAULT_USER.email
    }
  });
});

/**
 * POST /api/auth/login
 */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required.'
    });
  }

  if (email.toLowerCase().trim() !== DEFAULT_USER.email.toLowerCase()) {
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password.'
    });
  }

  const isPasswordValid = bcrypt.compareSync(password, DEFAULT_USER.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password.'
    });
  }

  const token = jwt.sign(
    {
      id: DEFAULT_USER.id,
      email: DEFAULT_USER.email,
      name: DEFAULT_USER.name
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.status(200).json({
    success: true,
    message: 'Login successful',
    token: token,
    user: {
      id: DEFAULT_USER.id,
      email: DEFAULT_USER.email,
      name: DEFAULT_USER.name
    }
  });
});

/**
 * GET /api/auth/me
 */
app.get('/api/auth/me', authenticateToken, (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user
  });
});

/**
 * POST /api/data or /api/items
 * PUBLIC ENDPOINT: Receives telemetry/event from Android or any client, saves to store, and broadcasts.
 */
const handlePostItem = async (req, res) => {
  try {
    const body = req.body;

    if (body === undefined || body === null || (typeof body === 'object' && Object.keys(body).length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Request body cannot be empty.'
      });
    }

    const id = body.id !== undefined && body.id !== null ? String(body.id) : crypto.randomUUID();

    const payloadContent = body.payload !== undefined 
      ? body.payload 
      : (body.data !== undefined ? body.data : (typeof body === 'string' ? body : JSON.stringify(body)));

    let createdAt = new Date();
    if (body.timestamp) {
      const parsed = new Date(body.timestamp);
      if (!isNaN(parsed.getTime())) createdAt = parsed;
    }

    const itemData = {
      id: id,
      ...body,
      id: id,
      data: payloadContent,
      payload: payloadContent,
      createdAt: createdAt
    };

    // Update in-memory store
    const existingIndex = memoryStore.findIndex(i => i.id === id);
    if (existingIndex !== -1) {
      memoryStore[existingIndex] = itemData;
    } else {
      memoryStore.unshift(itemData);
    }

    // Persist to MongoDB Atlas if connected
    await connectDB();
    if (mongoose.connection.readyState === 1) {
      try {
        await Item.findOneAndUpdate(
          { id: id },
          itemData,
          { upsert: true, returnDocument: 'after' }
        );
      } catch (err) {
        console.warn('[MongoDB] Save error:', err.message);
      }
    }

    // Broadcast ITEM_ADDED if WebSockets are active
    broadcast({
      type: 'ITEM_ADDED',
      item: itemData,
      totalCount: memoryStore.length,
      timestamp: new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      message: 'Item stored successfully',
      item: itemData,
      totalCount: memoryStore.length
    });
  } catch (error) {
    console.error('Error in handlePostItem:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to store item',
      details: error.message
    });
  }
};

app.post('/api/data', handlePostItem);
app.post('/api/items', handlePostItem);

/**
 * GET /api/data or /api/items
 * PROTECTED: Retrieves all documents.
 */
const handleGetAllItems = async (req, res) => {
  try {
    const items = await getAllItems();
    return res.status(200).json({
      success: true,
      count: items.length,
      data: items
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve data',
      details: error.message
    });
  }
};

app.get('/api/data', authenticateToken, handleGetAllItems);
app.get('/api/items', authenticateToken, handleGetAllItems);

/**
 * DELETE ALL /api/data/all or /api/items/all or DELETE /api/data
 * PROTECTED: Clears all documents.
 */
const handleDeleteAllItems = async (req, res) => {
  try {
    let deletedCount = 0;
    await connectDB();
    if (mongoose.connection.readyState === 1) {
      try {
        const result = await Item.deleteMany({});
        deletedCount = result.deletedCount || 0;
      } catch (err) {
        console.warn('[MongoDB] DeleteAll error:', err.message);
      }
    } else {
      deletedCount = memoryStore.length;
    }
    memoryStore = [];

    broadcast({
      type: 'ALL_DELETED',
      deletedCount: deletedCount,
      remainingCount: 0,
      timestamp: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: 'All items deleted successfully',
      deletedCount: deletedCount,
      remainingCount: 0
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to delete all items',
      details: error.message
    });
  }
};

app.delete('/api/data/all', authenticateToken, handleDeleteAllItems);
app.delete('/api/items/all', authenticateToken, handleDeleteAllItems);
app.delete('/api/data', authenticateToken, handleDeleteAllItems);
app.delete('/api/items', authenticateToken, handleDeleteAllItems);

/**
 * GET /api/data/:id or /api/items/:id
 * PROTECTED: Retrieves a single document by its unique ID.
 */
const handleGetItemById = async (req, res) => {
  try {
    const { id } = req.params;
    const searchId = String(id);
    
    await connectDB();
    let foundItem = null;

    if (mongoose.connection.readyState === 1) {
      try {
        foundItem = await Item.findOne({ id: searchId }).lean();
      } catch (err) {
        console.warn('[MongoDB] GetById error:', err.message);
      }
    }

    if (!foundItem) {
      foundItem = memoryStore.find(i => i.id === searchId);
    }

    if (!foundItem) {
      return res.status(404).json({
        success: false,
        error: `Item with ID "${id}" was not found`
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...foundItem,
        id: foundItem.id || (foundItem._id ? String(foundItem._id) : searchId)
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to query item',
      details: error.message
    });
  }
};

app.get('/api/data/:id', authenticateToken, handleGetItemById);
app.get('/api/items/:id', authenticateToken, handleGetItemById);

/**
 * DELETE /api/data/:id or /api/items/:id
 * PROTECTED: Deletes a single document by unique ID.
 */
const handleDeleteItemById = async (req, res) => {
  try {
    const { id } = req.params;
    const deleteId = String(id);
    let deletedItem = null;

    await connectDB();
    if (mongoose.connection.readyState === 1) {
      try {
        deletedItem = await Item.findOneAndDelete({ id: deleteId }).lean();
      } catch (err) {
        console.warn('[MongoDB] Delete error:', err.message);
      }
    }

    if (!deletedItem) {
      deletedItem = memoryStore.find(i => i.id === deleteId);
    }
    memoryStore = memoryStore.filter(i => i.id !== deleteId);

    if (!deletedItem) {
      return res.status(404).json({
        success: false,
        error: `Item with ID "${id}" was not found`
      });
    }

    broadcast({
      type: 'ITEM_DELETED',
      id: deleteId,
      deletedItem: deletedItem,
      remainingCount: memoryStore.length,
      timestamp: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: `Item with ID "${id}" deleted successfully`,
      deletedItem: deletedItem,
      remainingCount: memoryStore.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to delete item',
      details: error.message
    });
  }
};

app.delete('/api/data/:id', authenticateToken, handleDeleteItemById);
app.delete('/api/items/:id', authenticateToken, handleDeleteItemById);

/**
 * 404 Handler for undefined routes
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl}`
  });
});

/**
 * Global Error Handler - Returns clean JSON instead of HTML traces
 */
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Export app for Vercel Serverless Function deployment
module.exports = app;

// Only start listening if run directly (e.g. node server.js or local nodemon)
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`WebSocket server listening on ws://localhost:${PORT}`);
    console.log(`MongoDB Atlas Database: "${DB_NAME}"`);
    console.log(`Public POST endpoint: http://localhost:${PORT}/api/data`);
    console.log(`Default Auth User: ${DEFAULT_USER.email}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERROR] Port ${PORT} is already in use!`);
      console.error(`Please stop any other running instance on port ${PORT} or change the PORT in .env file.\n`);
    } else {
      console.error('Server failed to start:', err);
    }
  });
}
