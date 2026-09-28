const mongoose = require('mongoose');

const CorrectionLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    suggestedCategory: {
      type: String,
      default: '',
    },
    correctedCategory: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

CorrectionLogSchema.index({ userId: 1, description: 1 });

module.exports = mongoose.model('CorrectionLog', CorrectionLogSchema);
