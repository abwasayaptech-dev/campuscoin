const User = require('../models/User');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');

// @desc    Get admin platform analytics
// @route   GET /api/admin/stats
// @access  Private (Admin only)
const getAdminStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'student' });
    const activeUsers = await User.countDocuments({ role: 'student', isActive: true });
    const totalTransactions = await Transaction.countDocuments({ isDeleted: false });

    // Total transaction volume
    const volumeAgg = await Transaction.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
        },
      },
    ]);

    let totalExpenseVolume = 0;
    let totalIncomeVolume = 0;
    volumeAgg.forEach((v) => {
      if (v._id === 'expense') totalExpenseVolume = v.total;
      if (v._id === 'income') totalIncomeVolume = v.total;
    });

    // Most used categories
    const mostUsedCategories = await Transaction.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$categoryId',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: '$category' },
      {
        $project: {
          name: '$category.name',
          color: '$category.color',
          icon: '$category.icon',
          type: '$category.type',
          count: 1,
          totalAmount: 1,
        },
      },
    ]);

    // Recent registered students
    const recentStudents = await User.find({ role: 'student' })
      .select('name email academicYear monthlyAllowanceBaseline isActive createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        totalTransactions,
        totalExpenseVolume: Math.round(totalExpenseVolume),
        totalIncomeVolume: Math.round(totalIncomeVolume),
        mostUsedCategories,
        recentStudents,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all users with search & pagination
// @route   GET /api/admin/users
// @access  Private (Admin only)
const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, role } = req.query;

    const query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      data: users,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Toggle user active/disabled status
// @route   PUT /api/admin/users/:id/toggle-status
// @access  Private (Admin only)
const toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role === 'admin' && user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Administrators cannot deactivate their own active account.',
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    // Notify user of account status change
    try {
      await Notification.create({
        userId: user._id,
        type: 'account',
        title: user.isActive ? 'Account Re-enabled' : 'Account Disabled',
        message: user.isActive
          ? 'Your account has been reactivated by an administrator.'
          : 'Your account has been deactivated by an administrator.',
        data: { action: 'toggle_status', isActive: user.isActive },
      });
    } catch (notifErr) {
      console.error('Failed to create account status notification:', notifErr.message);
    }

    res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'disabled'} successfully`,
      data: { id: user._id, isActive: user.isActive },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Admin reset user password
// @route   PUT /api/admin/users/:id/reset-password
// @access  Private (Admin only)
const adminResetPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.passwordHash = newPassword;
    await user.save();

    // Notify user of password reset
    try {
      await Notification.create({
        userId: user._id,
        type: 'account',
        title: 'Password Reset by Admin',
        message: 'Your account password was reset by an administrator.',
        data: { action: 'admin_password_reset' },
      });
    } catch (notifErr) {
      console.error('Failed to create password reset notification:', notifErr.message);
    }

    res.status(200).json({
      success: true,
      message: `Password successfully updated for ${user.email}`,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    CRUD default categories - Create
// @route   POST /api/admin/categories
// @access  Private (Admin only)
const createDefaultCategory = async (req, res, next) => {
  try {
    const { name, type, icon, color } = req.body;

    const existing = await Category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      isDefault: true,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Default category "${name}" already exists`,
      });
    }

    const category = await Category.create({
      name: name.trim(),
      type: type || 'expense',
      icon: icon || 'tag',
      color: color || '#10b981',
      isDefault: true,
      userId: null,
    });

    // Notify all students of default category addition
    try {
      await Notification.create({
        userId: null,
        type: 'system',
        title: 'New Default Category Added',
        message: `A new default ${category.type} category "${category.name}" is now available to all students.`,
        data: { action: 'category_created', categoryId: category._id },
      });
    } catch (notifErr) {
      console.error('Failed to create category notification:', notifErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Default category created',
      data: category,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    CRUD default categories - Update
// @route   PUT /api/admin/categories/:id
// @access  Private (Admin only)
const updateDefaultCategory = async (req, res, next) => {
  try {
    const { name, type, icon, color } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    if (name) category.name = name.trim();
    if (type) category.type = type;
    if (icon) category.icon = icon;
    if (color) category.color = color;

    await category.save();

    // Broadcast notification of category update
    try {
      await Notification.create({
        userId: null,
        type: 'system',
        title: 'Default Category Updated',
        message: `Default category "${category.name}" was updated by an administrator.`,
        data: { action: 'category_updated', categoryId: category._id },
      });
    } catch (notifErr) {
      console.error('Failed to create category update notification:', notifErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Category updated',
      data: category,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    CRUD default categories - List
// @route   GET /api/admin/categories
// @access  Private (Admin only)
const getDefaultCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({
      $or: [{ userId: null }, { isDefault: true }],
    }).sort({ type: 1, name: 1 });

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    CRUD default categories - Delete
// @route   DELETE /api/admin/categories/:id
// @access  Private (Admin only)
const deleteDefaultCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const catName = category.name;
    await category.deleteOne();

    res.status(200).json({
      success: true,
      message: `Default category ${catName} removed`,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Announcements / Tip Templates - List
// @route   GET /api/admin/announcements
// @access  Public / Private
const getAnnouncements = async (req, res, next) => {
  try {
    const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: announcements.length, data: announcements });
  } catch (err) {
    next(err);
  }
};

// @desc    Announcements - Create
// @route   POST /api/admin/announcements
// @access  Private (Admin only)
const createAnnouncement = async (req, res, next) => {
  try {
    const { title, message, type } = req.body;
    const announcement = await Announcement.create({
      title: title.trim(),
      message: message.trim(),
      type: type || 'info',
      createdBy: req.user.id,
    });

    // Broadcast notification to all students
    try {
      await Notification.create({
        userId: null,
        type: 'announcement',
        title: title.trim(),
        message: message.trim(),
        data: { announcementId: announcement._id, announcementType: type || 'info' },
      });
    } catch (notifErr) {
      console.error('Failed to create broadcast notification:', notifErr.message);
    }

    res.status(201).json({ success: true, data: announcement });
  } catch (err) {
    next(err);
  }
};

// @desc    Announcements - Update
// @route   PUT /api/admin/announcements/:id
// @access  Private (Admin only)
const updateAnnouncement = async (req, res, next) => {
  try {
    const { title, message, type, isActive } = req.body;
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    if (title) announcement.title = title.trim();
    if (message) announcement.message = message.trim();
    if (type) announcement.type = type;
    if (isActive !== undefined) announcement.isActive = isActive;

    await announcement.save();

    res.status(200).json({ success: true, message: 'Announcement updated', data: announcement });
  } catch (err) {
    next(err);
  }
};

// @desc    Announcements - Delete
// @route   DELETE /api/admin/announcements/:id
// @access  Private (Admin only)
const deleteAnnouncement = async (req, res, next) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Announcement deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAdminStats,
  getAllUsers,
  toggleUserStatus,
  adminResetPassword,
  getDefaultCategories,
  createDefaultCategory,
  updateDefaultCategory,
  deleteDefaultCategory,
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
