const mongoose = require('mongoose');

const appUsageItemSchema = new mongoose.Schema(
  {
    packageName: { type: String, default: '' },
    appName: { type: String, default: '' },
    foregroundTimeMs: { type: Number, default: 0 },
    serviceRunningTimeMs: { type: Number, default: 0 },
    lastTimeUsed: { type: Date, default: null }
  },
  { _id: false }
);

const dailyUsageSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      index: true
    },
    date: {
      type: String, // 'YYYY-MM-DD'
      required: true,
      index: true
    },
    dataUsage: {
      mobileBytes: { type: Number, default: 0 },
      wifiBytes: { type: Number, default: 0 },
      totalBytes: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: Date.now }
    },
    appUsage: [appUsageItemSchema]
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Unique compound index so there is only one entry per device per date
dailyUsageSchema.index({ deviceId: 1, date: -1 }, { unique: true });

module.exports = mongoose.model('DailyUsage', dailyUsageSchema);
