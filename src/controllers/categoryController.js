const Category = require('../models/Category');
const Transaction = require('../models/Transaction');

// @desc    Get all accessible categories (defaults + user custom)
// @route   GET /api/categories
// @access  Private
const getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({
      $or: [{ userId: null }, { isDefault: true }, { userId: req.user.id }],
    }).sort({ isDefault: -1, name: 1 });

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a custom category
// @route   POST /api/categories
// @access  Private
const createCategory = async (req, res, next) => {
  try {
    const { name, type, icon, color } = req.body;

    // Check duplicate category name for this user or default
    const existing = await Category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      $or: [{ userId: null }, { userId: req.user.id }],
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Category with name "${name}" already exists.`,
      });
    }

    const category = await Category.create({
      name: name.trim(),
      type: type || 'expense',
      icon: icon || 'tag',
      color: color || '#10b981',
      isDefault: false,
      userId: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: category,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update custom category
// @route   PUT /api/categories/:id
// @access  Private
const updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    if (category.isDefault || !category.userId) {
      return res.status(403).json({
        success: false,
        message: 'System default categories cannot be modified by students.',
      });
    }

    if (category.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this category',
      });
    }

    const { name, type, icon, color } = req.body;
    if (name) category.name = name.trim();
    if (type) category.type = type;
    if (icon) category.icon = icon;
    if (color) category.color = color;

    await category.save();

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete custom category
// @route   DELETE /api/categories/:id
// @access  Private
const deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    if (category.isDefault || !category.userId) {
      return res.status(403).json({
        success: false,
        message: 'Default categories cannot be deleted.',
      });
    }

    if (category.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this category',
      });
    }

    // Check if category is used in active transactions
    const usedCount = await Transaction.countDocuments({
      categoryId: category._id,
      isDeleted: false,
    });

    if (usedCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: this category is used by ${usedCount} active transaction(s). Reassign them first.`,
      });
    }

    await category.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Category removed successfully',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
