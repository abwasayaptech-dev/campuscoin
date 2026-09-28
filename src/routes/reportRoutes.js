const express = require('express');
const {
  getDashboardSummary,
  getMonthlyReports,
  emailReport,
} = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/dashboard', getDashboardSummary);
router.get('/analytics', getMonthlyReports);
router.post('/email', emailReport);

module.exports = router;
