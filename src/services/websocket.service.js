const { WebSocket } = require('ws');

class WebSocketService {
  constructor() {
    this.wss = null;
  }

  /**
   * Sets the active WebSocketServer instance
   */
  setServer(wss) {
    this.wss = wss;
  }

  /**
   * Returns current count of connected WebSocket clients
   */
  getConnectedClientCount() {
    return this.wss && this.wss.clients ? this.wss.clients.size : 0;
  }

  /**
   * Broadcasts an event to all open and authenticated WebSocket clients
   */
  broadcast(event) {
    if (!this.wss || !this.wss.clients) return;
    const message = JSON.stringify(event);

    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && client.isAuthenticated !== false) {
        try {
          client.send(message);
        } catch (err) {
          console.warn('[WebSocketService] Broadcast error to client:', err.message);
        }
      }
    });
  }
}

module.exports = new WebSocketService();
