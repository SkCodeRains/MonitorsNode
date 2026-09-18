const crypto = require('crypto');
const Item = require('../models/item.model');
const { connectDB, isDbConnected } = require('../config/db');

class ItemRepository {
  constructor() {
    this.memoryStore = [];
  }

  /**
   * Retrieves all items from MongoDB or memory store fallback
   */
  async findAll() {
    await connectDB();
    if (isDbConnected()) {
      try {
        const items = await Item.find().sort({ updatedAt: -1, createdAt: -1 }).lean();
        return items.map(item => ({
          ...item,
          id: item.id || (item._id ? String(item._id) : crypto.randomUUID())
        }));
      } catch (err) {
        console.warn('[Repository] DB query failed, falling back to memory store:', err.message);
      }
    }
    return this.memoryStore;
  }

  /**
   * Retrieves paginated items with device filtering, category filtering, and search
   */
  async findPaginated({ page = 1, limit = 25, category = 'ALL', search = '', device = 'OTHER' }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    await connectDB();
    if (isDbConnected()) {
      try {
        const andConditions = [];

        // 1. Device Filter
        let deviceFilter = null;
        if (device === 'OTHER') {
          deviceFilter = {
            $or: [
              { deviceId: null },
              { deviceId: 'OTHER' },
              { deviceId: { $exists: false } },
              { deviceId: '' }
            ]
          };
          andConditions.push(deviceFilter);
        } else if (device && device !== 'ALL') {
          deviceFilter = { deviceId: String(device).trim() };
          andConditions.push(deviceFilter);
        }

        // 2. Category Filter
        if (category && category !== 'ALL') {
          const upperCat = category.toUpperCase();
          if (upperCat === 'WHATSAPP') {
            andConditions.push({
              $or: [
                { eventType: 'WHATSAPP' },
                { eventType: { $regex: 'WHATSAPP', $options: 'i' } },
                { source: { $regex: 'whatsapp', $options: 'i' } }
              ]
            });
          } else if (upperCat === 'CALL') {
            andConditions.push({
              $or: [
                { eventType: 'CALL' },
                { eventType: { $regex: 'CALL', $options: 'i' } },
                { source: { $regex: 'dialer|telecom|incallui|phone', $options: 'i' } }
              ]
            });
          } else if (upperCat === 'SMS') {
            andConditions.push({
              $or: [
                { eventType: 'SMS' },
                { eventType: { $regex: 'SMS', $options: 'i' } },
                { source: { $regex: 'messaging|mms', $options: 'i' } }
              ]
            });
          } else if (upperCat === 'NOTIFICATION') {
            andConditions.push({
              $or: [
                { eventType: 'NOTIFICATION' },
                { eventType: { $regex: 'NOTIFICATION', $options: 'i' } }
              ]
            });
          }
        }

        // 3. Search Text Filter
        if (search && search.trim()) {
          const sRegex = { $regex: search.trim(), $options: 'i' };
          andConditions.push({
            $or: [
              { id: sRegex },
              { title: sRegex },
              { text: sRegex },
              { source: sRegex },
              { eventType: sRegex },
              { data: sRegex },
              { payload: sRegex }
            ]
          });
        }

        const query = andConditions.length === 0 ? {}
          : andConditions.length === 1 ? andConditions[0]
          : { $and: andConditions };

        // Helper to scope category counts to the selected device
        const baseDeviceCond = deviceFilter ? [deviceFilter] : [];
        const scopeDevice = (cond) => {
          if (baseDeviceCond.length === 0) return cond;
          return { $and: [...baseDeviceCond, cond] };
        };

        const [totalItems, items, whatsappCount, callCount, smsCount, notifCount, allCount] = await Promise.all([
          Item.countDocuments(query),
          Item.find(query)
            .sort({ updatedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
          Item.countDocuments(scopeDevice({
            $or: [
              { eventType: 'WHATSAPP' },
              { eventType: { $regex: 'WHATSAPP', $options: 'i' } },
              { source: { $regex: 'whatsapp', $options: 'i' } }
            ]
          })),
          Item.countDocuments(scopeDevice({
            $or: [
              { eventType: 'CALL' },
              { eventType: { $regex: 'CALL', $options: 'i' } },
              { source: { $regex: 'dialer|telecom|incallui|phone', $options: 'i' } }
            ]
          })),
          Item.countDocuments(scopeDevice({
            $or: [
              { eventType: 'SMS' },
              { eventType: { $regex: 'SMS', $options: 'i' } },
              { source: { $regex: 'messaging|mms', $options: 'i' } }
            ]
          })),
          Item.countDocuments(scopeDevice({
            $or: [
              { eventType: 'NOTIFICATION' },
              { eventType: { $regex: 'NOTIFICATION', $options: 'i' } }
            ]
          })),
          Item.countDocuments(deviceFilter || {})
        ]);

        const mappedItems = items.map(item => ({
          ...item,
          id: item.id || (item._id ? String(item._id) : crypto.randomUUID()),
          deviceId: item.deviceId || 'OTHER'
        }));

        const totalPages = Math.max(1, Math.ceil(totalItems / limitNum));

        return {
          items: mappedItems,
          totalItems,
          totalPages,
          page: pageNum,
          limit: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
          categoryCounts: {
            ALL: allCount,
            WHATSAPP: whatsappCount,
            CALL: callCount,
            SMS: smsCount,
            NOTIFICATION: notifCount,
            OTHER: Math.max(0, allCount - (whatsappCount + callCount + smsCount + notifCount))
          }
        };
      } catch (err) {
        console.warn('[Repository] DB paginated query failed, falling back to memory store:', err.message);
      }
    }

    // Fallback: in-memory filtering and pagination
    let filtered = [...this.memoryStore];

    // Filter by Device
    if (device === 'OTHER') {
      filtered = filtered.filter(i => !i.deviceId || i.deviceId === 'OTHER');
    } else if (device && device !== 'ALL') {
      filtered = filtered.filter(i => i.deviceId === device);
    }

    // Filter by Category
    if (category && category !== 'ALL') {
      const upperCat = category.toUpperCase();
      filtered = filtered.filter(i => {
        const cat = (i.eventType || '').toUpperCase();
        const src = (i.source || '').toLowerCase();
        if (upperCat === 'WHATSAPP') return cat.includes('WHATSAPP') || src.includes('whatsapp');
        if (upperCat === 'CALL') return cat.includes('CALL') || src.includes('phone') || src.includes('dialer');
        if (upperCat === 'SMS') return cat.includes('SMS') || src.includes('messaging');
        if (upperCat === 'NOTIFICATION') return cat.includes('NOTIFICATION');
        return true;
      });
    }

    // Filter by Search
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter(i => {
        return (i.id && i.id.toLowerCase().includes(s)) ||
               (i.title && i.title.toLowerCase().includes(s)) ||
               (i.text && i.text.toLowerCase().includes(s)) ||
               (i.source && i.source.toLowerCase().includes(s)) ||
               (i.eventType && i.eventType.toLowerCase().includes(s));
      });
    }

    let whatsappCount = 0;
    let callCount = 0;
    let smsCount = 0;
    let notifCount = 0;
    let otherCount = 0;

    for (const i of filtered) {
      const cat = (i.eventType || '').toUpperCase();
      const src = (i.source || '').toLowerCase();
      if (cat.includes('WHATSAPP') || src.includes('whatsapp')) whatsappCount++;
      else if (cat.includes('CALL') || src.includes('phone') || src.includes('dialer')) callCount++;
      else if (cat.includes('SMS') || src.includes('messaging')) smsCount++;
      else if (cat.includes('NOTIFICATION')) notifCount++;
      else otherCount++;
    }

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limitNum));
    const pagedItems = filtered.slice(skip, skip + limitNum);

    return {
      items: pagedItems,
      totalItems,
      totalPages,
      page: pageNum,
      limit: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
      categoryCounts: {
        ALL: filtered.length,
        WHATSAPP: whatsappCount,
        CALL: callCount,
        SMS: smsCount,
        NOTIFICATION: notifCount,
        OTHER: otherCount
      }
    };
  }

  /**
   * Retrieves a single item by unique ID
   */
  async findById(id) {
    const searchId = String(id);
    await connectDB();

    if (isDbConnected()) {
      try {
        const found = await Item.findOne({ id: searchId }).lean();
        if (found) {
          return {
            ...found,
            id: found.id || (found._id ? String(found._id) : searchId)
          };
        }
      } catch (err) {
        console.warn('[Repository] DB query error:', err.message);
      }
    }

    return this.memoryStore.find(i => i.id === searchId) || null;
  }

  /**
   * Saves or updates an item in both in-memory store and MongoDB Atlas
   */
  async save(itemData) {
    const existingIndex = this.memoryStore.findIndex(i => i.id === itemData.id);
    if (existingIndex !== -1) {
      this.memoryStore[existingIndex] = itemData;
    } else {
      this.memoryStore.unshift(itemData);
    }

    await connectDB();
    if (isDbConnected()) {
      try {
        await Item.findOneAndUpdate(
          { id: itemData.id },
          {
            $set: {
              ...itemData,
              createdAt: itemData.createdAt || new Date(),
              updatedAt: new Date()
            }
          },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );
      } catch (err) {
        console.warn('[Repository] MongoDB save error:', err.message);
      }
    }

    return itemData;
  }

  /**
   * Deletes a single item by ID
   */
  async deleteById(id) {
    const deleteId = String(id);
    let deletedItem = null;

    await connectDB();
    if (isDbConnected()) {
      try {
        deletedItem = await Item.findOneAndDelete({ id: deleteId }).lean();
      } catch (err) {
        console.warn('[Repository] MongoDB delete error:', err.message);
      }
    }

    if (!deletedItem) {
      deletedItem = this.memoryStore.find(i => i.id === deleteId);
    }

    this.memoryStore = this.memoryStore.filter(i => i.id !== deleteId);

    return deletedItem;
  }

  /**
   * Clears all items
   */
  async deleteAll() {
    let deletedCount = 0;

    await connectDB();
    if (isDbConnected()) {
      try {
        const result = await Item.deleteMany({});
        deletedCount = result.deletedCount || 0;
      } catch (err) {
        console.warn('[Repository] MongoDB deleteAll error:', err.message);
      }
    } else {
      deletedCount = this.memoryStore.length;
    }

    this.memoryStore = [];
    return deletedCount;
  }

  async count() {
    const items = await this.findAll();
    return items.length;
  }
}

module.exports = new ItemRepository();
