const mongoose = require('mongoose');

const exclusionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    type: {
      type: String,
      enum: ['title', 'package'],
      default: 'title',
      required: true,
      index: true
    },
    value: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
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

const Exclusion = mongoose.models.Exclusion || mongoose.model('Exclusion', exclusionSchema);

module.exports = Exclusion;
