const express = require('express');
const { getBudgets, setBudget, deleteBudget } = require('../controllers/budgetController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getBudgets)
  .post(setBudget);

router.route('/:id')
  .delete(deleteBudget);

module.exports = router;
