const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null means global default category
    },
    name: {
      type: String,
      required: [true, 'Please provide category name'],
      trim: true,
      maxlength: [50, 'Category name cannot exceed 50 characters'],
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: [true, 'Category type must be income or expense'],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    icon: {
      type: String,
      default: 'tag', // icon key name (lucide icon identifier)
    },
    color: {
      type: String,
      default: '#10b981',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user categories lookup
CategorySchema.index({ userId: 1, type: 1 });
CategorySchema.index({ name: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Category', CategorySchema);
