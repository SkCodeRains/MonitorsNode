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
    if (itemData.deviceId) {
      await deviceRepository.registerOrTouch(itemData.deviceId, itemData.deviceName);
    }
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

  /**
   * Retrieves calls grouped by contact / phone number with nested history
   */
  async getGroupedCalls(options = {}) {
    const { device = 'ALL', search = '' } = options;
    const paginated = await itemRepository.findPaginated({
      page: 1,
      limit: 500,
      category: 'CALL',
      device,
      search
    });

    const items = paginated.items || [];
    const groupsMap = new Map();

    for (const item of items) {
      const call = extractCallDetails(item);
      const groupKey = call.phoneNumber !== 'Unknown' ? call.phoneNumber.replace(/[\s-]/g, '') : call.callerName;

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          key: groupKey,
          phoneNumber: call.phoneNumber,
          contactName: call.callerName,
          totalCalls: 0,
          incomingCount: 0,
          outgoingCount: 0,
          missedCount: 0,
          lastCallTime: call.timestamp,
          calls: []
        });
      }

      const grp = groupsMap.get(groupKey);
      grp.totalCalls++;
      if (call.direction === 'INCOMING') grp.incomingCount++;
      else if (call.direction === 'OUTGOING') grp.outgoingCount++;
      else if (call.direction === 'MISSED' || call.direction === 'REJECTED') grp.missedCount++;

      if (call.timestamp > grp.lastCallTime) {
        grp.lastCallTime = call.timestamp;
      }
      grp.calls.push(call);
    }

    const grouped = Array.from(groupsMap.values());
    grouped.sort((a, b) => b.lastCallTime - a.lastCallTime);

    // Sort calls inside each contact newest first
    for (const grp of grouped) {
      grp.calls.sort((a, b) => b.timestamp - a.timestamp);
    }

    return grouped;
  }

  /**
   * Retrieves SMS messages grouped into conversation threads
   */
  async getGroupedMessages(options = {}) {
    const { device = 'ALL', search = '' } = options;
    const paginated = await itemRepository.findPaginated({
      page: 1,
      limit: 500,
      category: 'SMS',
      device,
      search
    });

    const items = paginated.items || [];
    const threadsMap = new Map();

    for (const item of items) {
      const msg = extractSmsDetails(item);
      const threadKey = msg.address !== 'Unknown' ? msg.address.replace(/[\s-]/g, '') : msg.contactName;

      if (!threadsMap.has(threadKey)) {
        threadsMap.set(threadKey, {
          threadId: threadKey,
          address: msg.address,
          contactName: msg.contactName,
          lastMessage: msg.body,
          lastMessageTime: msg.timestamp,
          totalMessages: 0,
          messages: []
        });
      }

      const thr = threadsMap.get(threadKey);
      thr.totalMessages++;
      if (msg.timestamp >= thr.lastMessageTime) {
        thr.lastMessageTime = msg.timestamp;
        thr.lastMessage = msg.body;
      }
      thr.messages.push(msg);
    }

    const threads = Array.from(threadsMap.values());
    threads.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

    // Sort messages inside thread chronologically (oldest to newest for chat bubbles)
    for (const thr of threads) {
      thr.messages.sort((a, b) => a.timestamp - b.timestamp);
    }

    return threads;
  }
}

function extractCallDetails(item) {
  let payload = item.payload;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
  }
  payload = payload || {};

  const text = item.text || payload.text || '';
  const title = item.title || payload.title || '';
  const combined = `${title} ${text}`;

  let phoneNumber = payload.phoneNumber || payload.number || '';
  if (!phoneNumber) {
    const numMatch = text.match(/Number:\s*([^\s•]+)/i) || combined.match(/(\+?\d[\d\s-]{6,15}\d)/);
    if (numMatch) phoneNumber = numMatch[1].trim();
  }
  if (!phoneNumber) phoneNumber = 'Unknown';

  let callerName = '';
  const callerMatch = text.match(/Caller:\s*([^•\n]+)/i);
  if (callerMatch) {
    callerName = callerMatch[1].trim();
  } else if (title.includes('(')) {
    callerName = title.substring(0, title.indexOf('(')).trim();
  }
  if (!callerName || callerName === phoneNumber) {
    callerName = phoneNumber !== 'Unknown' ? phoneNumber : 'Unknown Caller';
  }

  let direction = 'UNKNOWN';
  if (/incoming/i.test(combined)) direction = 'INCOMING';
  else if (/outgoing/i.test(combined)) direction = 'OUTGOING';
  else if (/missed/i.test(combined)) direction = 'MISSED';
  else if (/rejected/i.test(combined)) direction = 'REJECTED';

  let durationText = '0s';
  const durMatch = text.match(/(?:Talked for|Duration:)\s*([^•\n]+)/i);
  if (durMatch) {
    durationText = durMatch[1].trim();
  }

  return {
    id: item.id,
    callerName,
    phoneNumber,
    direction,
    durationText,
    timestamp: item.timestamp || (item.createdAt ? new Date(item.createdAt).getTime() : Date.now()),
    createdAt: item.createdAt
  };
}

function extractSmsDetails(item) {
  let payload = item.payload;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
  }
  payload = payload || {};

  const text = item.text || payload.text || '';
  const title = item.title || payload.title || '';

  let address = payload.phoneNumber || payload.number || '';
  const addrMatch = text.match(/Number:\s*([^\s•]+)/i);
  if (addrMatch) address = addrMatch[1].trim();
  if (!address) address = 'Unknown';

  let contactName = '';
  const contactMatch = text.match(/Contact:\s*([^•\n]+)/i);
  if (contactMatch) {
    contactName = contactMatch[1].trim();
  } else if (title.includes('(')) {
    contactName = title.substring(0, title.indexOf('(')).trim();
  }
  if (!contactName || contactName === address) {
    contactName = address;
  }

  let body = '';
  const bodyMatch = text.match(/Message:\s*([\s\S]+)$/i);
  if (bodyMatch) {
    body = bodyMatch[1].trim();
  } else {
    body = text;
  }

  const isSent = /sent|outgoing|SMS_SENT/i.test(item.eventType || '') || /sent/i.test(text) || /sent/i.test(item.packageName || '');
  const direction = isSent ? 'OUTGOING' : 'INCOMING';

  return {
    id: item.id,
    address,
    contactName,
    body,
    direction,
    timestamp: item.timestamp || (item.createdAt ? new Date(item.createdAt).getTime() : Date.now()),
    createdAt: item.createdAt
  };
}

module.exports = new ItemService();
