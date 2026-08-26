const crypto = require('crypto');
const itemRepository = require('../repositories/item.repository');
const websocketService = require('./websocket.service');
const { BadRequestError, NotFoundError } = require('../errors');

class ItemService {
  /**
   * Processes, persists, and broadcasts a newly received item/event
   */
  async createItem(body) {
    if (body === undefined || body === null || (typeof body === 'object' && Object.keys(body).length === 0)) {
      throw new BadRequestError('Request body cannot be empty.');
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

    const savedItem = await itemRepository.save(itemData);
    const totalCount = itemRepository.memoryStore.length;

    // Broadcast ITEM_ADDED to all active WebSocket clients
    websocketService.broadcast({
      type: 'ITEM_ADDED',
      item: savedItem,
      totalCount: totalCount,
      timestamp: new Date().toISOString()
    });

    return {
      item: savedItem,
      totalCount: totalCount
    };
  }

  /**
   * Retrieves all items ordered newest first
   */
  async getAllItems() {
    return await itemRepository.findAll();
  }

  /**
   * Retrieves a single item by unique ID
   */
  async getItemById(id) {
    const item = await itemRepository.findById(id);
    if (!item) {
      throw new NotFoundError(`Item with ID "${id}" was not found`);
    }
    return item;
  }

  /**
   * Deletes a single item and notifies WebSocket subscribers
   */
  async deleteItemById(id) {
    const deletedItem = await itemRepository.deleteById(id);
    if (!deletedItem) {
      throw new NotFoundError(`Item with ID "${id}" was not found`);
    }

    const remainingCount = itemRepository.memoryStore.length;

    websocketService.broadcast({
      type: 'ITEM_DELETED',
      id: String(id),
      deletedItem: deletedItem,
      remainingCount: remainingCount,
      timestamp: new Date().toISOString()
    });

    return {
      deletedItem,
      remainingCount
    };
  }

  /**
   * Deletes all stored items and broadcasts ALL_DELETED
   */
  async deleteAllItems() {
    const deletedCount = await itemRepository.deleteAll();

    websocketService.broadcast({
      type: 'ALL_DELETED',
      deletedCount: deletedCount,
      remainingCount: 0,
      timestamp: new Date().toISOString()
    });

    return {
      deletedCount,
      remainingCount: 0
    };
  }
}

module.exports = new ItemService();
