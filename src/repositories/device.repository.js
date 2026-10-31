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
      totalCount: 0,
      dataUsage: {
        mobileBytes: 0,
        wifiBytes: 0,
        totalBytes: 0,
        lastUpdated: null
      },
      appUsage: []
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
          const deviceCount = await Item.countDocuments({ deviceId: d.deviceId });
          this.deviceCache.set(d.deviceId, {
            id: d.deviceId,
            deviceId: d.deviceId,
            name: d.name || d.deviceId,
            brand: d.brand || '',
            model: d.model || '',
            osVersion: d.osVersion || '',
            firstSeen: d.firstSeen || new Date(),
            lastSeen: d.lastSeen || new Date(),
            totalCount: deviceCount,
            dataUsage: d.dataUsage || {
              mobileBytes: 0,
              wifiBytes: 0,
              totalBytes: 0,
              lastUpdated: null
            },
            appUsage: d.appUsage || []
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
   * Returns all active devices with live updated item counts
   */
  async getAllDevices() {
    await this.init();

    // Dynamically update live counts from MongoDB so counts are never stale
    try {
      if (isDbConnected()) {
        const counts = await Item.aggregate([
          {
            $group: {
              _id: '$deviceId',
              count: { $sum: 1 }
            }
          }
        ]);

        const countMap = new Map();
        let otherTotal = 0;
        for (const c of counts) {
          if (!c._id || c._id === 'OTHER') {
            otherTotal += c.count;
          } else {
            countMap.set(String(c._id).trim().toLowerCase(), c.count);
          }
        }

        const other = this.deviceCache.get('OTHER');
        if (other) {
          other.totalCount = otherTotal;
        }

        for (const [key, val] of this.deviceCache.entries()) {
          if (key !== 'OTHER') {
            const cleanKey = String(key).trim().toLowerCase();
            val.totalCount = countMap.get(cleanKey) || 0;
          }
        }
      }
    } catch (err) {
      console.warn('[DeviceRepository] Failed to refresh live device counts:', err.message);
    }

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

      // Background DB touch
      try {
        await Device.updateOne(
          { deviceId: cleanId },
          {
            $set: { lastSeen: new Date(), ...(cleanName && { name: cleanName }) },
            $inc: { totalCount: 1 }
          }
        );
      } catch (err) {
        console.warn('[DeviceRepository] Touch DB error:', err.message);
      }

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
      totalCount: 1,
      dataUsage: {
        mobileBytes: 0,
        wifiBytes: 0,
        totalBytes: 0,
        lastUpdated: null
      },
      appUsage: []
    };

    this.deviceCache.set(cleanId, newDevice);
    console.log(`[DeviceRepository] Auto-registered brand new device in RAM: "${cleanName}" (${cleanId})`);

    // Save to MongoDB
    try {
      await Device.findOneAndUpdate(
        { deviceId: cleanId },
        newDevice,
        { upsert: true, returnDocument: 'after' }
      );
    } catch (err) {
      console.warn('[DeviceRepository] Auto-register DB error:', err.message);
    }

    return newDevice;
  }

  /**
   * Updates per-day data usage for a device
   */
  async updateDataUsage(deviceId, { mobileBytes = 0, wifiBytes = 0, totalBytes = 0, timestamp = null }) {
    await this.init();

    const cleanId = String(deviceId).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const lastUpdated = timestamp ? new Date(timestamp) : new Date();
    const usageData = {
      mobileBytes: Number(mobileBytes) || 0,
      wifiBytes: Number(wifiBytes) || 0,
      totalBytes: Number(totalBytes) || ((Number(mobileBytes) || 0) + (Number(wifiBytes) || 0)),
      lastUpdated
    };

    let device = this.deviceCache.get(cleanId);
    if (!device) {
      device = await this.registerOrTouch(cleanId, cleanId);
    }

    if (device) {
      device.dataUsage = usageData;
      device.lastSeen = new Date();
    }

    // Persist to MongoDB
    try {
      await Device.updateOne(
        { deviceId: cleanId },
        { $set: { dataUsage: usageData, lastSeen: new Date() } }
      );
    } catch (err) {
      console.warn('[DeviceRepository] Data usage DB update error:', err.message);
    }

    return device;
  }

  /**
   * Updates daily app usage timing for a device
   */
  async updateAppUsage(deviceId, appList = []) {
    await this.init();

    const cleanId = String(deviceId).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const sanitizedApps = Array.isArray(appList) ? appList.map(a => ({
      packageName: String(a.packageName || '').trim(),
      appName: String(a.appName || a.packageName || 'Unknown').trim(),
      foregroundTimeMs: Number(a.foregroundTimeMs) || 0,
      serviceRunningTimeMs: Number(a.serviceRunningTimeMs) || 0,
      lastTimeUsed: a.lastTimeUsed ? new Date(a.lastTimeUsed) : new Date()
    })) : [];

    let device = this.deviceCache.get(cleanId);
    if (!device) {
      device = await this.registerOrTouch(cleanId, cleanId);
    }

    if (device) {
      device.appUsage = sanitizedApps;
      device.lastSeen = new Date();
    }

    // Persist to MongoDB
    try {
      await Device.updateOne(
        { deviceId: cleanId },
        { $set: { appUsage: sanitizedApps, lastSeen: new Date() } }
      );
    } catch (err) {
      console.warn('[DeviceRepository] App usage DB update error:', err.message);
    }

    return device;
  }

  /**
   * Resets totalCount for a specific device (e.g. after deleting its items)
   */
  async resetDeviceCount(deviceId) {
    await this.init();
    const cleanId = (!deviceId || deviceId === 'OTHER')
      ? 'OTHER'
      : String(deviceId).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const entry = this.deviceCache.get(cleanId);
    if (entry) {
      entry.totalCount = 0;
    }

    if (cleanId !== 'OTHER') {
      Device.updateOne({ deviceId: cleanId }, { $set: { totalCount: 0 } })
        .exec()
        .catch(err => console.warn('[DeviceRepository] Reset device count DB error:', err.message));
    }
  }

  /**
   * Resets totalCount for all devices to 0
   */
  async resetAllDeviceCounts() {
    await this.init();
    for (const [, val] of this.deviceCache.entries()) {
      val.totalCount = 0;
    }

    Device.updateMany({}, { $set: { totalCount: 0 } })
      .exec()
      .catch(err => console.warn('[DeviceRepository] Reset all device counts DB error:', err.message));
  }

  /**
   * Decrements device totalCount by a given amount (default 1)
   */
  async decrementDeviceCount(deviceId, amount = 1) {
    await this.init();
    const cleanId = (!deviceId || deviceId === 'OTHER')
      ? 'OTHER'
      : String(deviceId).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const entry = this.deviceCache.get(cleanId);
    if (entry) {
      entry.totalCount = Math.max(0, (entry.totalCount || 0) - amount);
    }

    if (cleanId !== 'OTHER') {
      Device.updateOne(
        { deviceId: cleanId },
        [
          {
            $set: {
              totalCount: {
                $max: [0, { $subtract: [{ $ifNull: ['$totalCount', 0] }, amount] }]
              }
            }
          }
        ]
      ).exec().catch(err => console.warn('[DeviceRepository] Decrement DB error:', err.message));
    }
  }

  /**
   * Synchronizes all device totalCounts against real Item documents in MongoDB
   */
  async syncAllDeviceCounts() {
    try {
      await connectDB();
      if (isDbConnected()) {
        const otherCount = await Item.countDocuments({
          $or: [
            { deviceId: null },
            { deviceId: 'OTHER' },
            { deviceId: { $exists: false } },
            { deviceId: '' }
          ]
        });
        const otherEntry = this.deviceCache.get('OTHER');
        if (otherEntry) otherEntry.totalCount = otherCount;

        for (const [key, val] of this.deviceCache.entries()) {
          if (key !== 'OTHER') {
            const count = await Item.countDocuments({ deviceId: key });
            val.totalCount = count;
            Device.updateOne({ deviceId: key }, { $set: { totalCount: count } }).exec().catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('[DeviceRepository] syncAllDeviceCounts error:', err.message);
    }
  }
}

module.exports = new DeviceRepository();
