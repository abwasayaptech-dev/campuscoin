const express = require('express');
const {
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
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Publicly readable active announcements
router.get('/announcements/public', getAnnouncements);

// Protected routes (Admin role only)
router.use(protect);
router.use(authorize('admin'));

router.get('/stats', getAdminStats);
router.get('/users', getAllUsers);
router.put('/users/:id/toggle-status', toggleUserStatus);
router.put('/users/:id/reset-password', adminResetPassword);

// Default category management
router.get('/categories', getDefaultCategories);
router.post('/categories', createDefaultCategory);
router.put('/categories/:id', updateDefaultCategory);
router.delete('/categories/:id', deleteDefaultCategory);

// Announcements management
router.get('/announcements', getAnnouncements);
router.post('/announcements', createAnnouncement);
router.put('/announcements/:id', updateAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);

module.exports = router;
