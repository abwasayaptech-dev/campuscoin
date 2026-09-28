const express = require('express');
const {
  getNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  clearReadNotifications,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', getNotifications);
router.post('/', createNotification);
router.patch('/read-all', markAllAsRead);
router.put('/read-all', markAllAsRead);
router.delete('/clear-read', clearReadNotifications);
router.patch('/:id/read', markAsRead);
router.put('/:id/read', markAsRead);

module.exports = router;

