const express = require('express');
const { getTips, updateTipStatus } = require('../controllers/tipController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', getTips);
router.put('/:id/status', updateTipStatus);
router.patch('/:id/status', updateTipStatus);

module.exports = router;
