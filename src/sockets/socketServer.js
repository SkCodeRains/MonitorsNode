const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const itemService = require('../services/item.service');
const websocketService = require('../services/websocket.service');

function initWebSocketServer(server) {
  let wss = null;
  try {
    wss = new WebSocketServer({ server });
    websocketService.setServer(wss);
  } catch (err) {
    console.warn('[WebSocket] Warning initializing WebSocketServer:', err.message);
    return null;
  }

  wss.on('connection', (ws, req) => {
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
        const decoded = jwt.verify(token, config.JWT_SECRET);
        ws.user = decoded;
        ws.isAuthenticated = true;
      } catch {
        ws.isAuthenticated = false;
      }
    } else {
      ws.isAuthenticated = false;
    }

    // Synchronously attach event listeners immediately to prevent dropping early messages
    ws.on('message', async (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage.toString());
        const action = payload.action || payload.type;

        // Handle Authentication over WebSocket
        if (action === 'AUTH') {
          const msgToken = payload.token;
          try {
            const decoded = jwt.verify(msgToken, config.JWT_SECRET);
            ws.user = decoded;
            ws.isAuthenticated = true;
            ws.send(JSON.stringify({
              type: 'AUTH_SUCCESS',
              user: { email: decoded.email, name: decoded.name }
            }));

            const items = await itemService.getAllItems();
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
            const items = await itemService.getAllItems();
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
              await itemService.createItem(payload);
            }
            break;
          }

          case 'DELETE':
          case 'DELETE_ITEM': {
            if (payload.id) {
              try {
                await itemService.deleteItemById(payload.id);
              } catch (err) {
                console.warn('[WebSocket] DeleteItem warning:', err.message);
              }
            }
            break;
          }

          case 'DELETE_ALL': {
            try {
              await itemService.deleteAllItems();
            } catch (err) {
              console.warn('[WebSocket] DeleteAll warning:', err.message);
            }
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
      console.log(`[WebSocket] Client disconnected (Remaining clients: ${wss.clients ? wss.clients.size : 0})`);
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Socket error:', err.message);
    });

    // Send initial state asynchronously if authenticated
    if (ws.isAuthenticated) {
      console.log(`[WebSocket] Authenticated client connected: ${ws.user.email} (${clientIp})`);
      itemService.getAllItems().then(items => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'INITIAL_STATE',
            data: items,
            totalCount: items.length,
            timestamp: new Date().toISOString()
          }));
        }
      }).catch(err => {
        console.warn('[WebSocket] Initial state fetch error:', err.message);
      });
    } else {
      console.log(`[WebSocket] Anonymous client connected (${clientIp}) - awaiting auth`);
    }
  });

  return wss;
}

module.exports = { initWebSocketServer };
