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
    // 1. Maintain in-memory store
    const existingIndex = this.memoryStore.findIndex(i => i.id === itemData.id);
    if (existingIndex !== -1) {
      this.memoryStore[existingIndex] = itemData;
    } else {
      this.memoryStore.unshift(itemData);
    }

    // 2. Persist to MongoDB Atlas if active
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
