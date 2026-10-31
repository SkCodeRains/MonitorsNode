const crypto = require('crypto');
const itemRepository = require('../repositories/item.repository');
const deviceRepository = require('../repositories/device.repository');
const { BadRequestError, NotFoundError } = require('../errors');

class ItemService {
  /**
   * Processes and persists a newly received item/event
   */
  async createItem(body) {
    if (body === undefined || body === null || (typeof body === 'object' && Object.keys(body).length === 0)) {
      throw new BadRequestError('Request body cannot be empty.');
    }

    const devicePrefix = (body.deviceId && String(body.deviceId).trim())
      ? String(body.deviceId).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
      : 'OTHER';

    let id;
    if (body.id !== undefined && body.id !== null && String(body.id).trim() !== '') {
      const rawId = String(body.id).trim();
      const parts = rawId.split('_');
      // If rawId already has timestamp suffix (e.g. dev_logId_timestamp), keep it
      if (rawId.startsWith(`${devicePrefix}_`) && parts.length >= 3) {
        id = rawId;
      } else {
        const cleanRaw = rawId.startsWith(`${devicePrefix}_`) ? rawId.replace(`${devicePrefix}_`, '') : rawId;
        const tsSuffix = body.timestamp ? `_${body.timestamp}` : `_${Date.now()}`;
        id = `${devicePrefix}_${cleanRaw}${tsSuffix}`;
      }
    } else {
      id = `${devicePrefix}_${Date.now()}_${crypto.randomUUID()}`;
    }

    const payloadContent = body.payload !== undefined
      ? body.payload
      : (body.data !== undefined ? body.data : (typeof body === 'string' ? body : JSON.stringify(body)));

    let eventDate = null;
    let numericTimestamp = null;

    if (body.timestamp !== undefined && body.timestamp !== null) {
      const numTimestamp = Number(body.timestamp);
      if (!isNaN(numTimestamp) && numTimestamp > 0) {
        numericTimestamp = numTimestamp;
        eventDate = new Date(numTimestamp);
      } else {
        const parsed = new Date(body.timestamp);
        if (!isNaN(parsed.getTime())) {
          eventDate = parsed;
          numericTimestamp = parsed.getTime();
        }
      }
    } else if (body.createdAt) {
      const parsed = new Date(body.createdAt);
      if (!isNaN(parsed.getTime())) {
        eventDate = parsed;
        numericTimestamp = parsed.getTime();
      }
    }

    const createdAt = eventDate || new Date();
    const finalTimestamp = numericTimestamp || createdAt.getTime();

    const itemData = {
      ...body,
      id: id,
      clientLogId: body.id ? String(body.id) : null,
      deviceId: body.deviceId || null,
      deviceName: body.deviceName || null,
      data: payloadContent,
      payload: payloadContent,
      timestamp: finalTimestamp,
      createdAt: createdAt
    };

    const savedItem = await itemRepository.save(itemData);
    const totalCount = itemRepository.memoryStore.length;

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
   * Retrieves paginated items with optional category filtering and search
   */
  async getPaginatedItems(options = {}) {
    return await itemRepository.findPaginated(options);
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
   * Deletes a single item by unique ID
   */
  async deleteItemById(id) {
    const deletedItem = await itemRepository.deleteById(id);
    if (!deletedItem) {
      throw new NotFoundError(`Item with ID "${id}" was not found`);
    }

    // Decrement the corresponding device count
    const targetDevId = deletedItem.deviceId || 'OTHER';
    await deviceRepository.decrementDeviceCount(targetDevId, 1);

    const remainingCount = itemRepository.memoryStore.length;

    return {
      deletedItem,
      remainingCount
    };
  }

  /**
   * Deletes stored items (optionally for a specific device)
   */
  async deleteAllItems(device = null) {
    const deletedCount = await itemRepository.deleteAll(device);

    if (device && device !== 'ALL') {
      await deviceRepository.resetDeviceCount(device);
    } else {
      await deviceRepository.resetAllDeviceCounts();
    }

    return {
      deletedCount,
      device: device || 'ALL',
      remainingCount: 0
    };
  }
}

module.exports = new ItemService();
