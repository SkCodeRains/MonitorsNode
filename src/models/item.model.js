const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    deviceId: {
      type: String,
      default: null,
      index: true
    },
    deviceName: {
      type: String,
      default: null
    },
    eventType: {
      type: String,
      default: 'GENERIC',
      index: true
    },
    source: {
      type: String,
      default: 'CLIENT',
      index: true
    },
    timestamp: {
      type: mongoose.Schema.Types.Mixed,
      default: () => Date.now()
    },
    payload: {
      type: mongoose.Schema.Types.Mixed
    },
    data: {
      type: mongoose.Schema.Types.Mixed
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: true,
    strict: false,
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

// High-Performance Compound Indexes for Device and Channel Filtering
itemSchema.index({ deviceId: 1, createdAt: -1 });
itemSchema.index({ deviceId: 1, eventType: 1, createdAt: -1 });

const Item = mongoose.models.Item || mongoose.model('Item', itemSchema);

module.exports = Item;
