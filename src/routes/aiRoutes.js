const express = require('express');
const { suggestCategory, learnCorrection } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/suggest-category', suggestCategory);
router.post('/correct-category', learnCorrection);

module.exports = router;
