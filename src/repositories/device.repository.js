const Device = require('../models/device.model');
const Item = require('../models/item.model');
const { connectDB, isDbConnected } = require('../config/db');

class DeviceRepository {
  constructor() {
    this.deviceCache = new Map();
    this.isInitialized = false;

    // Default entry for legacy and unassigned devices
    this.deviceCache.set('OTHER', {
      id: 'OTHER',
      deviceId: 'OTHER',
      name: 'Other (Vivo / Legacy)',
      brand: 'Vivo / Legacy',
      model: 'Legacy',
      osVersion: '',
      firstSeen: new Date(),
      lastSeen: new Date(),
      totalCount: 0
    });
  }

  /**
   * Initializes in-memory cache once on boot or first request
   */
  async init() {
    if (this.isInitialized) return;

    try {
      await connectDB();
      if (isDbConnected()) {
        const devices = await Device.find().sort({ lastSeen: -1 }).lean();
        for (const d of devices) {
          this.deviceCache.set(d.deviceId, {
            id: d.deviceId,
            deviceId: d.deviceId,
            name: d.name || d.deviceId,
            brand: d.brand || '',
            model: d.model || '',
            osVersion: d.osVersion || '',
            firstSeen: d.firstSeen || new Date(),
            lastSeen: d.lastSeen || new Date(),
            totalCount: d.totalCount || 0
          });
        }

        // Count existing records for OTHER bucket
        const otherCount = await Item.countDocuments({
          $or: [
            { deviceId: null },
            { deviceId: 'OTHER' },
            { deviceId: { $exists: false } },
            { deviceId: '' }
          ]
        });
        const otherEntry = this.deviceCache.get('OTHER');
        if (otherEntry) {
          otherEntry.totalCount = otherCount;
        }

        this.isInitialized = true;
        console.log(`[DeviceRepository] In-memory cache initialized with ${this.deviceCache.size} device(s)`);
      }
    } catch (err) {
      console.warn('[DeviceRepository] Failed to initialize from DB, using fallback cache:', err.message);
    }
  }

  /**
   * Returns all active devices with OTHER permanently as the first tab
   */
  async getAllDevices() {
    await this.init();

    // Re-verify OTHER count in real-time or from cache
    const devicesList = [];
    const other = this.deviceCache.get('OTHER');
    if (other) {
      devicesList.push(other);
    }

    for (const [key, val] of this.deviceCache.entries()) {
      if (key !== 'OTHER') {
        devicesList.push(val);
      }
    }

    return devicesList;
  }

  /**
   * Fast 0ms memory check or on-the-fly auto registration
   */
  async registerOrTouch(deviceId, deviceName, meta = {}) {
    await this.init();

    // If no deviceId or OTHER, update OTHER bucket
    if (!deviceId || deviceId === 'OTHER') {
      const other = this.deviceCache.get('OTHER');
      if (other) {
        other.totalCount += 1;
        other.lastSeen = new Date();
      }
      return other;
    }

    const cleanId = String(deviceId).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const cleanName = deviceName ? String(deviceName).trim() : cleanId;

    if (this.deviceCache.has(cleanId)) {
      // Device already in RAM cache -> update in 0ms!
      const existing = this.deviceCache.get(cleanId);
      existing.totalCount += 1;
      existing.lastSeen = new Date();
      if (cleanName && cleanName !== cleanId) {
        existing.name = cleanName;
      }

      // Background non-blocking DB touch
      Device.updateOne(
        { deviceId: cleanId },
        {
          $set: { lastSeen: new Date(), ...(cleanName && { name: cleanName }) },
          $inc: { totalCount: 1 }
        }
      ).exec().catch(err => console.warn('[DeviceRepository] Touch DB error:', err.message));

      return existing;
    }

    // Brand new phone posting for the first time -> Auto-register!
    const newDevice = {
      id: cleanId,
      deviceId: cleanId,
      name: cleanName,
      brand: meta.brand || '',
      model: meta.model || '',
      osVersion: meta.osVersion || '',
      firstSeen: new Date(),
      lastSeen: new Date(),
      totalCount: 1
    };

    this.deviceCache.set(cleanId, newDevice);
    console.log(`[DeviceRepository] Auto-registered brand new device in RAM: "${cleanName}" (${cleanId})`);

    // Asynchronously save to MongoDB
    Device.findOneAndUpdate(
      { deviceId: cleanId },
      newDevice,
      { upsert: true, returnDocument: 'after' }
    ).exec().catch(err => console.warn('[DeviceRepository] Auto-register DB error:', err.message));

    return newDevice;
  }
}

module.exports = new DeviceRepository();
