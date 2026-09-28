const Notification = require('../models/Notification');

// @desc    Get user notifications (user-specific + broadcast)
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res, next) => {
  try {
    const rawNotifications = await Notification.find({
      $or: [{ userId: req.user.id }, { userId: null }],
    })
      .sort({ createdAt: -1 })
      .limit(50);

    const notifications = rawNotifications.map((doc) => {
      const isRead = doc.userId
        ? Boolean(doc.read)
        : Boolean(doc.readBy && doc.readBy.some((id) => id.toString() === req.user.id.toString()));

      return {
        _id: doc._id,
        userId: doc.userId,
        title: doc.title,
        message: doc.message,
        type: doc.type,
        data: doc.data,
        read: isRead,
        is_read: isRead,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });

    const unreadCount = notifications.filter((n) => !n.read).length;

    res.status(200).json({
      success: true,
      unreadCount,
      data: notifications,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create notification (Admin / System broadcast or targeted)
// @route   POST /api/notifications
// @access  Private
const createNotification = async (req, res, next) => {
  try {
    const { userId, title, message, type, data } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const notification = await Notification.create({
      userId: userId === 'all' || !userId ? null : userId,
      title: title || 'System Notification',
      message: message.trim(),
      type: type || 'system',
      data: data || {},
    });

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: notification,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Mark notification as read
// @route   PATCH/PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    if (notification.userId) {
      if (notification.userId.toString() !== req.user.id.toString()) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }
      notification.read = true;
      await notification.save();
    } else {
      // Broadcast notification
      if (!notification.readBy) notification.readBy = [];
      if (!notification.readBy.some((id) => id.toString() === req.user.id.toString())) {
        notification.readBy.push(req.user.id);
        await notification.save();
      }
    }

    res.status(200).json({
      success: true,
      data: {
        _id: notification._id,
        read: true,
        is_read: true,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Mark all notifications as read
// @route   PATCH/PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res, next) => {
  try {
    // 1. Mark user-specific notifications as read
    await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });

    // 2. Add user to readBy array for broadcast notifications
    await Notification.updateMany(
      { userId: null, readBy: { $ne: req.user.id } },
      { $addToSet: { readBy: req.user.id } }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Clear all read notifications
// @route   DELETE /api/notifications/clear-read
// @access  Private
const clearReadNotifications = async (req, res, next) => {
  try {
    await Notification.deleteMany({ userId: req.user.id, read: true });

    res.status(200).json({
      success: true,
      message: 'Read notifications cleared',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  clearReadNotifications,
};

