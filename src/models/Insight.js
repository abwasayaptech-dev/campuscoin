const mongoose = require('mongoose');

const InsightSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    month: {
      type: String, // "YYYY-MM"
      required: true,
    },
    summaryText: {
      type: String,
      required: true,
    },
    tipText: {
      type: String,
      default: '',
    },
    growthFlags: [
      {
        category: String,
        growthPercentage: Number,
        currentSpend: Number,
        previousSpend: Number,
        advice: String,
      },
    ],
    healthScore: {
      score: { type: Number, default: 75 },
      vibe: { type: String, default: 'Chill & Steady 🍜' },
      status: { type: String, default: 'healthy' }, // healthy, warning, critical
    },
    metrics: {
      totalExpense: { type: Number, default: 0 },
      totalIncome: { type: Number, default: 0 },
      netSavings: { type: Number, default: 0 },
      savingsRate: { type: Number, default: 0 },
      dailyBurnRate: { type: Number, default: 0 },
      microSpendTotal: { type: Number, default: 0 },
      microSpendCount: { type: Number, default: 0 },
      weekendSpendPercent: { type: Number, default: 0 },
      topCategory: { type: String, default: '' },
      topCategoryPercent: { type: Number, default: 0 },
    },
    actionableNudges: [
      {
        title: String,
        description: String,
        potentialSavings: Number,
        category: String,
        priority: String,
        icon: String,
      },
    ],
    isBookmarked: {
      type: Boolean,
      default: false,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

InsightSchema.index({ userId: 1, month: -1 });

module.exports = mongoose.model('Insight', InsightSchema);
