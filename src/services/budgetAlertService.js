const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const Notification = require('../models/Notification');

/**
 * Check budget consumption for a user & category and dispatch in-app notifications
 * @param {string|ObjectId} userId
 * @param {string|ObjectId} categoryId
 * @param {Date|string} date
 * @returns {Promise<Object|null>} Alert details if generated
 */
const checkAndDispatchBudgetAlert = async (userId, categoryId, date = new Date()) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const categoryObjectId = new mongoose.Types.ObjectId(categoryId);
    const d = new Date(date);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    // Find monthly budget limit
    const budget = await Budget.findOne({
      userId: userObjectId,
      categoryId: categoryObjectId,
      month: monthStr,
    });

    if (!budget || !budget.limitAmount || budget.limitAmount <= 0) {
      return null;
    }

    // Calculate current month's total spend for this category
    const startDate = new Date(d.getFullYear(), d.getMonth(), 1);
    const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

    const spendAgg = await Transaction.aggregate([
      {
        $match: {
          userId: userObjectId,
          categoryId: categoryObjectId,
          type: 'expense',
          isDeleted: false,
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    const totalSpent = spendAgg[0] ? Math.round(spendAgg[0].total * 100) / 100 : 0;
    const limitAmount = budget.limitAmount;
    const percentage = Math.round((totalSpent / limitAmount) * 100);

    const category = await Category.findById(categoryObjectId);
    const catName = category ? category.name : 'Category';

    // 1. Critical Alert: Budget Exceeded (>= 100%)
    if (totalSpent >= limitAmount) {
      const overAmount = Math.round((totalSpent - limitAmount) * 100) / 100;
      
      // Check if we already alerted for exceeded this month
      const existingExceeded = await Notification.findOne({
        userId: userObjectId,
        type: 'budget_exceeded',
        'data.categoryId': categoryObjectId,
        'data.month': monthStr,
        createdAt: { $gte: startDate },
      });

      if (!existingExceeded) {
        const notif = await Notification.create({
          userId: userObjectId,
          type: 'budget_exceeded',
          title: `🚨 Budget Exceeded: ${catName}`,
          message: `You have spent $${totalSpent.toFixed(2)} in ${catName}, exceeding your $${limitAmount.toFixed(2)} monthly limit (${percentage}% spent, +$${overAmount.toFixed(2)} over)!`,
          data: {
            categoryId: categoryObjectId,
            categoryName: catName,
            month: monthStr,
            totalSpent,
            limitAmount,
            percentage,
            overAmount,
          },
        });
        return { type: 'budget_exceeded', notification: notif, totalSpent, limitAmount, percentage };
      }
    }
    // 2. Warning Alert: Budget Nearing Cap (>= 80% and < 100%)
    else if (totalSpent >= limitAmount * 0.8) {
      const existingWarning = await Notification.findOne({
        userId: userObjectId,
        type: 'budget_warning',
        'data.categoryId': categoryObjectId,
        'data.month': monthStr,
        createdAt: { $gte: startDate },
      });

      if (!existingWarning) {
        const notif = await Notification.create({
          userId: userObjectId,
          type: 'budget_warning',
          title: `⚠️ Budget Warning: ${catName} at ${percentage}%`,
          message: `Heads up! You have used ${percentage}% of your ${catName} budget ($${totalSpent.toFixed(2)} / $${limitAmount.toFixed(2)}). $${(limitAmount - totalSpent).toFixed(2)} remaining.`,
          data: {
            categoryId: categoryObjectId,
            categoryName: catName,
            month: monthStr,
            totalSpent,
            limitAmount,
            percentage,
            remaining: limitAmount - totalSpent,
          },
        });
        return { type: 'budget_warning', notification: notif, totalSpent, limitAmount, percentage };
      }
    }

    return null;
  } catch (err) {
    console.error('[BudgetAlertService Error]', err);
    return null;
  }
};

/**
 * Check all active budgets for a user for a given month
 */
const checkAllBudgetsForUser = async (userId, monthStr) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const budgets = await Budget.find({ userId: userObjectId, month: monthStr });
    for (const b of budgets) {
      await checkAndDispatchBudgetAlert(userId, b.categoryId, new Date());
    }
  } catch (err) {
    console.error('[checkAllBudgetsForUser Error]', err);
  }
};

module.exports = {
  checkAndDispatchBudgetAlert,
  checkAllBudgetsForUser,
};
