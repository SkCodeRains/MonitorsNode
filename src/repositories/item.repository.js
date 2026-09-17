const crypto = require('crypto');
const Item = require('../models/item.model');
const { connectDB, isDbConnected } = require('../config/db');

class ItemRepository {
  constructor() {
    this.memoryStore = [];
  }

  /**
   * Retrieves all items from MongoDB (sorted by database index) or memory store fallback
   */
  async findAll() {
    await connectDB();
    if (isDbConnected()) {
      try {
        const items = await Item.find().sort({ createdAt: -1 }).lean();
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
   * Retrieves paginated items with optional category filtering and search
   */
  async findPaginated({ page = 1, limit = 25, category = 'ALL', search = '' }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    await connectDB();
    if (isDbConnected()) {
      try {
        const query = {};

        // Category filter
        if (category && category !== 'ALL') {
          const upperCat = category.toUpperCase();
          if (upperCat === 'WHATSAPP') {
            query.$or = [
              { eventType: { $regex: 'WHATSAPP', $options: 'i' } },
              { source: { $regex: 'whatsapp', $options: 'i' } }
            ];
          } else if (upperCat === 'CALL') {
            query.$or = [
              { eventType: { $regex: 'CALL', $options: 'i' } },
              { source: { $regex: 'dialer|telecom|incallui|phone', $options: 'i' } }
            ];
          } else if (upperCat === 'SMS') {
            query.$or = [
              { eventType: { $regex: 'SMS', $options: 'i' } },
              { source: { $regex: 'messaging|mms', $options: 'i' } }
            ];
          } else if (upperCat === 'NOTIFICATION') {
            query.$or = [
              { eventType: { $regex: 'NOTIFICATION', $options: 'i' } }
            ];
          }
        }

        // Search text filter
        if (search && search.trim()) {
          const sRegex = { $regex: search.trim(), $options: 'i' };
          const searchOr = [
            { id: sRegex },
            { title: sRegex },
            { text: sRegex },
            { source: sRegex },
            { eventType: sRegex },
            { data: sRegex },
            { payload: sRegex }
          ];
          if (query.$or) {
            query.$and = [
              { $or: query.$or },
              { $or: searchOr }
            ];
            delete query.$or;
          } else {
            query.$or = searchOr;
          }
        }

        const [totalItems, items, whatsappCount, callCount, smsCount, notifCount, allCount] = await Promise.all([
          Item.countDocuments(query),
          Item.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
          Item.countDocuments({
            $or: [
              { eventType: { $regex: 'WHATSAPP', $options: 'i' } },
              { source: { $regex: 'whatsapp', $options: 'i' } }
            ]
          }),
          Item.countDocuments({
            $or: [
              { eventType: { $regex: 'CALL', $options: 'i' } },
              { source: { $regex: 'dialer|telecom|incallui|phone', $options: 'i' } }
            ]
          }),
          Item.countDocuments({
            $or: [
              { eventType: { $regex: 'SMS', $options: 'i' } },
              { source: { $regex: 'messaging|mms', $options: 'i' } }
            ]
          }),
          Item.countDocuments({
            eventType: { $regex: 'NOTIFICATION', $options: 'i' }
          }),
          Item.countDocuments({})
        ]);

        const mappedItems = items.map(item => ({
          ...item,
          id: item.id || (item._id ? String(item._id) : crypto.randomUUID())
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

    for (const i of this.memoryStore) {
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
        ALL: this.memoryStore.length,
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
          itemData,
          { upsert: true, returnDocument: 'after' }
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
   * Clears all items from both in-memory store and MongoDB Atlas
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

  /**
   * Synchronizes in-memory items into MongoDB once connected
   */
  async syncMemoryToDb() {
    if (this.memoryStore.length === 0 || !isDbConnected()) return;
    try {
      for (const item of this.memoryStore) {
        await Item.findOneAndUpdate({ id: item.id }, item, { upsert: true, returnDocument: 'after' });
      }
      console.log(`[Repository] Synced ${this.memoryStore.length} in-memory item(s) to Atlas`);
    } catch (err) {
      console.warn('[Repository] Sync error:', err.message);
    }
  }

  /**
   * Returns current count of stored items
   */
  async count() {
    const items = await this.findAll();
    return items.length;
  }
}

module.exports = new ItemRepository();
