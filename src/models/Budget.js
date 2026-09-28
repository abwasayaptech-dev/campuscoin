const mongoose = require('mongoose');

const BudgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    month: {
      type: String, // Format "YYYY-MM" e.g., "2025-03"
      required: true,
      index: true,
    },
    limitAmount: {
      type: Number,
      required: [true, 'Please specify budget limit amount'],
      min: [1, 'Budget limit must be at least 1'],
    },
  },
  {
    timestamps: true,
  }
);

// One budget per category per month per user
BudgetSchema.index({ userId: 1, categoryId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Budget', BudgetSchema);
