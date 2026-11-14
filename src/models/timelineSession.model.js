const mongoose = require('mongoose');

const appSwapSchema = new mongoose.Schema(
  {
    packageName: { type: String, default: '' },
    appName: { type: String, default: '' },
    startTime: { type: Number, required: true },
    endTime: { type: Number, required: true },
    durationSeconds: { type: Number, default: 0 }
  },
  { _id: false }
);

const sessionItemSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true },
    startTime: { type: Number, required: true },
    endTime: { type: Number, required: true },
    durationSeconds: { type: Number, default: 0 },
    isOngoing: { type: Boolean, default: false },
    appSwaps: [appSwapSchema]
  },
  { _id: false }
);

const timelineSessionSchema = new mongoose.Schema(
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
    totalScreenTimeSeconds: {
      type: Number,
      default: 0
    },
    totalUnlocks: {
      type: Number,
      default: 0
    },
    sessions: [sessionItemSchema]
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

timelineSessionSchema.index({ deviceId: 1, date: -1 }, { unique: true });

module.exports = mongoose.model('TimelineSession', timelineSessionSchema);
