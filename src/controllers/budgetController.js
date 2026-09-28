const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const { checkAndDispatchBudgetAlert, checkAllBudgetsForUser } = require('../services/budgetAlertService');

// @desc    Get budgets for user for specific month (with actual spend calculated)
// @route   GET /api/budgets
// @access  Private
const getBudgets = async (req, res, next) => {
  try {
    const { month } = req.query;
    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Verify and dispatch alerts in background
    checkAllBudgetsForUser(req.user.id, targetMonth).catch(() => {});

    const [year, monthNum] = targetMonth.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    // Get all user budgets for month
    const budgets = await Budget.find({
      userId: req.user.id,
      month: targetMonth,
    }).populate('categoryId', 'name icon color type');

    // Aggregate expenses for this month per category
    const expenseAgg = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          type: 'expense',
          isDeleted: false,
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$categoryId',
          totalSpent: { $sum: '$amount' },
        },
      },
    ]);

    const spendMap = {};
    expenseAgg.forEach((item) => {
      spendMap[item._id.toString()] = item.totalSpent;
    });

    const enrichedBudgets = budgets.map((b) => {
      const spent = b.categoryId ? spendMap[b.categoryId._id.toString()] || 0 : 0;
      const limit = b.limitAmount;
      const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      const remaining = Math.max(0, limit - spent);

      return {
        _id: b._id,
        month: b.month,
        categoryId: b.categoryId,
        limitAmount: limit,
        spent: Math.round(spent * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        percentage,
        isWarning: percentage >= 80 && percentage < 100,
        isExceeded: percentage >= 100,
      };
    });

    res.status(200).json({
      success: true,
      month: targetMonth,
      data: enrichedBudgets,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Set or update a category budget
// @route   POST /api/budgets
// @access  Private
const setBudget = async (req, res, next) => {
  try {
    const { categoryId, month, limitAmount } = req.body;

    if (!categoryId || !month || !limitAmount) {
      return res.status(400).json({
        success: false,
        message: 'Please provide categoryId, month (YYYY-MM), and limitAmount',
      });
    }

    const budget = await Budget.findOneAndUpdate(
      {
        userId: req.user.id,
        categoryId,
        month,
      },
      {
        limitAmount: Number(limitAmount),
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    ).populate('categoryId', 'name icon color type');

    // Immediately evaluate consumption and dispatch notification if threshold reached
    const budgetAlert = await checkAndDispatchBudgetAlert(
      req.user.id,
      categoryId,
      new Date(month + '-01')
    );

    res.status(200).json({
      success: true,
      message: 'Budget saved successfully',
      data: budget,
      budgetAlert: budgetAlert ? {
        type: budgetAlert.type,
        percentage: budgetAlert.percentage,
        limitAmount: budgetAlert.limitAmount,
        totalSpent: budgetAlert.totalSpent,
      } : null,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete a budget
// @route   DELETE /api/budgets/:id
// @access  Private
const deleteBudget = async (req, res, next) => {
  try {
    const budget = await Budget.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!budget) {
      return res.status(404).json({ success: false, message: 'Budget not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Budget removed',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBudgets,
  setBudget,
  deleteBudget,
};
