const crypto = require('crypto');
const Exclusion = require('../models/exclusion.model');
const { connectDB, isDbConnected } = require('../config/db');

const DEFAULT_EXCLUSIONS = [
  { type: 'title', value: 'कलम-उन्नति व MKN न्यूज़ 🌹139' },
  { type: 'title', value: 'Alpha Coaching Classes' },
  { type: 'title', value: 'Fi - Sabhilillah' },
  { type: 'title', value: 'Fi-Sabhilillah' },
  { type: 'title', value: 'Fi Sabhilillah' },
  { type: 'title', value: 'Fi - Sabilillah' },
  { type: 'title', value: 'Fi-Sabilillah' },
  { type: 'package', value: 'com.google.android.youtube' },
  { type: 'package', value: 'com.google.android.apps.youtube.music' }
];

class ExclusionRepository {
  constructor() {
    this.memoryStore = [];
    this.hasSeeded = false;
  }

  async seedDefaultsIfEmpty() {
    if (this.hasSeeded) return;
    const count = await this.count();
    if (count === 0) {
      console.log('[ExclusionRepository] Seeding default exclusions...');
      for (const item of DEFAULT_EXCLUSIONS) {
        await this.save({
          id: crypto.randomUUID(),
          type: item.type,
          value: item.value,
          createdAt: new Date()
        });
      }
    }
    this.hasSeeded = true;
  }

  async findAll() {
    await connectDB();
    if (isDbConnected()) {
      try {
        const items = await Exclusion.find().sort({ createdAt: -1 }).lean();
        if (items.length > 0) {
          return items.map(item => ({
            ...item,
            id: item.id || (item._id ? String(item._id) : crypto.randomUUID())
          }));
        }
      } catch (err) {
        console.warn('[ExclusionRepository] DB query failed, falling back to memory store:', err.message);
      }
    }
    await this.seedDefaultsIfEmpty();
    return this.memoryStore;
  }

  async findById(id) {
    const searchId = String(id);
    await connectDB();

    if (isDbConnected()) {
      try {
        const found = await Exclusion.findOne({ id: searchId }).lean();
        if (found) {
          return {
            ...found,
            id: found.id || (found._id ? String(found._id) : searchId)
          };
        }
      } catch (err) {
        console.warn('[ExclusionRepository] DB query error:', err.message);
      }
    }

    return this.memoryStore.find(i => i.id === searchId) || null;
  }

  async findByValue(value) {
    const clean = String(value).trim().toLowerCase();
    const all = await this.findAll();
    return all.find(i => i.value.trim().toLowerCase() === clean) || null;
  }

  async save(itemData) {
    const item = {
      id: itemData.id || crypto.randomUUID(),
      type: itemData.type || 'title',
      value: String(itemData.value).trim(),
      createdAt: itemData.createdAt || new Date()
    };

    const existingIndex = this.memoryStore.findIndex(i => i.id === item.id);
    if (existingIndex !== -1) {
      this.memoryStore[existingIndex] = item;
    } else {
      this.memoryStore.unshift(item);
    }

    await connectDB();
    if (isDbConnected()) {
      try {
        await Exclusion.findOneAndUpdate(
          { id: item.id },
          item,
          { upsert: true, returnDocument: 'after' }
        );
      } catch (err) {
        console.warn('[ExclusionRepository] MongoDB save error:', err.message);
      }
    }

    return item;
  }

  async deleteById(id) {
    const deleteId = String(id);
    let deletedItem = null;

    await connectDB();
    if (isDbConnected()) {
      try {
        deletedItem = await Exclusion.findOneAndDelete({ id: deleteId }).lean();
      } catch (err) {
        console.warn('[ExclusionRepository] MongoDB delete error:', err.message);
      }
    }

    if (!deletedItem) {
      deletedItem = this.memoryStore.find(i => i.id === deleteId);
    }

    this.memoryStore = this.memoryStore.filter(i => i.id !== deleteId);
    return deletedItem;
  }

  async count() {
    await connectDB();
    if (isDbConnected()) {
      try {
        const c = await Exclusion.countDocuments();
        if (c > 0) return c;
      } catch (err) {
        // fallback
      }
    }
    return this.memoryStore.length;
  }
}

module.exports = new ExclusionRepository();
