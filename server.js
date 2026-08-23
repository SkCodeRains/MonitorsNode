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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://skcoderains_db_user:U.%2F6d3RC_bQiqAV@cluster0.ltf5au1.mongodb.net/monitor_db?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'monitor_db';

// Disable Mongoose command buffering so queries don't hang if Atlas is connecting
mongoose.set('bufferCommands', false);

// In-Memory fallback store for zero-latency operations even when MongoDB is connecting
let memoryStore = [];
let isDbConnected = false;

// Connect to MongoDB Atlas with production keepalive and self-healing connection pool
mongoose.connect(MONGODB_URI, { 
  dbName: DB_NAME,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 2,           // Keeps minimum 2 warm connections open
  maxIdleTimeMS: 60000,     // Recycles idle connections older than 60s
  heartbeatFrequencyMS: 10000 // SDAM heartbeat every 10s keeps TCP sockets alive through routers
})
  .then(async () => {
    isDbConnected = true;
    console.log(`[MongoDB] Connected successfully to Atlas Cluster (Database: "${DB_NAME}")`);

    // Sync any items stored in memory into MongoDB Atlas
    if (memoryStore.length > 0) {
      try {
        for (const item of memoryStore) {
          await Item.findOneAndUpdate({ id: item.id }, item, { upsert: true, returnDocument: 'after' });
        }
        console.log(`[MongoDB] Synced ${memoryStore.length} in-memory item(s) to Atlas`);
      } catch (err) {
        console.error('[MongoDB] Sync error:', err.message);
      }
    }
  })
  .catch((err) => {
    isDbConnected = false;
    console.warn(`\n[MongoDB Notice] Could not connect to Atlas: ${err.message}`);
    console.warn(`👉 Action Needed: In MongoDB Atlas dashboard -> Network Access -> Add IP Address -> Select "Allow Access from Anywhere (0.0.0.0/0)" or your current IP.`);
    console.log(`[Storage] Seamlessly operating with fast in-memory storage while waiting for Atlas connection.\n`);
  });

mongoose.connection.on('connected', () => {
  isDbConnected = true;
});

mongoose.connection.on('disconnected', () => {
  isDbConnected = false;
  console.warn('[MongoDB] Disconnected from Atlas - using in-memory store');
});

// User credentials (bcrypt hashed)
const DEFAULT_USER = {
  id: 'usr_admin_01',
  email: 'skcoderains@gmail.com',
  name: 'CodeRains Admin',
  passwordHash: bcrypt.hashSync('CodeR@ins69', 10)
};

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

// Middleware for parsing JSON and URL-encoded data
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Create standard HTTP server wrapping Express
const server = http.createServer(app);

// Initialize WebSocket Server attached to the HTTP server
const wss = new WebSocketServer({ server });

/**
 * Broadcast event message to all authenticated WebSocket clients
 */
function broadcast(event) {
  const message = JSON.stringify(event);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.isAuthenticated !== false) {
      client.send(message);
    }
  });
}

/**
 * Helper to fetch all items (from Atlas if connected, otherwise from memoryStore)
 */
async function getAllItems() {
  if (isDbConnected) {
    try {
      const items = await Item.find().sort({ createdAt: -1 }).lean();
      return items;
    } catch (err) {
      console.warn('[Storage] DB query failed, using memory store:', err.message);
    }
  }
  return [...memoryStore].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Handle WebSocket Client Connections
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
            const createdAt = payload.timestamp 
              ? (typeof payload.timestamp === 'number' ? new Date(payload.timestamp) : new Date(payload.timestamp))
              : new Date();

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
            if (isDbConnected) {
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
            const itemToDelete = memoryStore.find(i => i.id === deleteId);
            memoryStore = memoryStore.filter(i => i.id !== deleteId);

            if (isDbConnected) {
              try {
                await Item.findOneAndDelete({ id: deleteId });
              } catch (err) {
                console.warn('[MongoDB] Delete error:', err.message);
              }
            }

            if (itemToDelete) {
              broadcast({
                type: 'ITEM_DELETED',
                id: deleteId,
                deletedItem: itemToDelete,
                remainingCount: memoryStore.length,
                timestamp: new Date().toISOString()
              });
            }
          }
          break;
        }

        case 'DELETE_ALL': {
          const count = memoryStore.length;
          memoryStore = [];

          if (isDbConnected) {
            try {
              await Item.deleteMany({});
            } catch (err) {
              console.warn('[MongoDB] DeleteAll error:', err.message);
            }
          }

          broadcast({
            type: 'ALL_DELETED',
            deletedCount: count,
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
  res.status(200).json({
    name: 'MongoDB Atlas & Express REST + WebSocket Telemetry API',
    status: 'Running',
    database: {
      status: isDbConnected ? 'Connected (Atlas)' : 'In-Memory (Awaiting Atlas Whitelist)',
      name: DB_NAME
    },
    totalStoredItems: items.length,
    connectedWebSocketClients: wss.clients.size,
    wsEndpoint: `ws://localhost:${PORT}`,
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
  const { email, password } = req.body;

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
 * PUBLIC ENDPOINT: Receives telemetry/event from Android or any client, saves to store, and broadcasts in real-time.
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

    const createdAt = body.timestamp 
      ? (typeof body.timestamp === 'number' ? new Date(body.timestamp) : new Date(body.timestamp))
      : new Date();

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
    if (isDbConnected) {
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

    // Broadcast ITEM_ADDED in real-time
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
 * PROTECTED: Clears all documents and broadcasts ALL_DELETED.
 */
const handleDeleteAllItems = async (req, res) => {
  try {
    const count = memoryStore.length;
    memoryStore = [];

    if (isDbConnected) {
      try {
        await Item.deleteMany({});
      } catch (err) {
        console.warn('[MongoDB] DeleteAll error:', err.message);
      }
    }

    broadcast({
      type: 'ALL_DELETED',
      deletedCount: count,
      remainingCount: 0,
      timestamp: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: 'All items deleted successfully',
      deletedCount: count,
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
    const items = await getAllItems();
    const foundItem = items.find(i => i.id === String(id));

    if (!foundItem) {
      return res.status(404).json({
        success: false,
        error: `Item with ID "${id}" was not found`
      });
    }

    return res.status(200).json({
      success: true,
      data: foundItem
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
    const itemToDelete = memoryStore.find(i => i.id === deleteId);
    memoryStore = memoryStore.filter(i => i.id !== deleteId);

    if (isDbConnected) {
      try {
        await Item.findOneAndDelete({ id: deleteId });
      } catch (err) {
        console.warn('[MongoDB] Delete error:', err.message);
      }
    }

    if (!itemToDelete) {
      return res.status(404).json({
        success: false,
        error: `Item with ID "${id}" was not found`
      });
    }

    broadcast({
      type: 'ITEM_DELETED',
      id: deleteId,
      deletedItem: itemToDelete,
      remainingCount: memoryStore.length,
      timestamp: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: `Item with ID "${id}" deleted successfully`,
      deletedItem: itemToDelete,
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
 * Global Error Handler
 */
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start the HTTP & WebSocket server
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
