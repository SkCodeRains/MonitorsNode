const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true
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
    strict: false, // Allows arbitrary custom properties sent by telemetry/Android callers
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

const Item = mongoose.models.Item || mongoose.model('Item', itemSchema);

module.exports = Item;
