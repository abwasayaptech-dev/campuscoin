const mongoose = require('mongoose');

const TipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: 'General',
    },
    potentialSavings: {
      type: Number,
      default: 0,
    },
    impactScore: {
      type: Number,
      default: 50,
    },
    status: {
      type: String,
      enum: ['active', 'pinned', 'dismissed'],
      default: 'active',
      index: true,
    },
    source: {
      type: String,
      enum: ['system', 'ai', 'admin'],
      default: 'system',
    },
  },
  {
    timestamps: true,
  }
);

TipSchema.index({ userId: 1, status: 1, impactScore: -1 });

module.exports = mongoose.model('Tip', TipSchema);
