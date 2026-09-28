const express = require('express');
const {
  register,
  login,
  adminLogin,
  getMe,
  updateProfile,
  uploadStudentAvatar,
  updateTheme,
  completeOnboarding,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/admin/login', adminLogin);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:resetToken', resetPassword);

// Protected routes
router.use(protect);
router.get('/me', getMe);
router.put('/profile', updateProfile);
router.post('/profile/avatar', uploadAvatar.single('avatar'), uploadStudentAvatar);
router.put('/theme', updateTheme);
router.put('/onboarding', completeOnboarding);

module.exports = router;
