const express = require('express');
const {
  getInsight,
  getInsightHistory,
  toggleBookmarkInsight,
} = require('../controllers/insightController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', getInsight);
router.post('/generate', getInsight);
router.get('/history', getInsightHistory);
router.put('/:id/bookmark', toggleBookmarkInsight);
router.patch('/:id/bookmark', toggleBookmarkInsight);

module.exports = router;
