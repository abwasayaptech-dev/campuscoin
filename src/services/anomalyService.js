const Transaction = require('../models/Transaction');

/**
 * Checks if a transaction is an anomaly (duplicate or unusually high)
 * @param {Object} txData { userId, amount, description, categoryId, date, type }
 * @param {Object} user User document
 * @returns {Promise<{ isFlagged: boolean, flagReason: string | null }>}
 */
const detectAnomaly = async (txData, user) => {
  if (txData.type !== 'expense') {
    return { isFlagged: false, flagReason: null };
  }

  const txDate = txData.date ? new Date(txData.date) : new Date();
  const oneDayBefore = new Date(txDate.getTime() - 24 * 60 * 60 * 1000);
  const oneDayAfter = new Date(txDate.getTime() + 24 * 60 * 60 * 1000);

  // 1. Check duplicate within 24h
  const duplicate = await Transaction.findOne({
    userId: txData.userId,
    isDeleted: false,
    amount: txData.amount,
    date: { $gte: oneDayBefore, $lte: oneDayAfter },
    description: new RegExp(`^${txData.description.trim()}$`, 'i'),
  });

  if (duplicate) {
    return {
      isFlagged: true,
      flagReason: `Potential duplicate: Identical $${txData.amount} transaction found within 24 hours ("${duplicate.description}").`,
    };
  }

  // 2. Check unusually high compared to user's allowance or typical expense
  const allowance = user.monthlyAllowanceBaseline || 500;
  if (txData.amount >= allowance * 0.4) {
    return {
      isFlagged: true,
      flagReason: `Unusually large transaction: $${txData.amount} represents ${(
        (txData.amount / allowance) *
        100
      ).toFixed(0)}% of your monthly allowance baseline ($${allowance}).`,
    };
  }

  // 3. Statistical outlier against recent 30-day average
  const thirtyDaysAgo = new Date(txDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentExpenses = await Transaction.find({
    userId: txData.userId,
    type: 'expense',
    isDeleted: false,
    date: { $gte: thirtyDaysAgo },
  }).select('amount');

  if (recentExpenses.length >= 5) {
    const total = recentExpenses.reduce((sum, t) => sum + t.amount, 0);
    const mean = total / recentExpenses.length;
    if (txData.amount > mean * 3 && txData.amount > 50) {
      return {
        isFlagged: true,
        flagReason: `High expense alert: $${txData.amount} is over 3x your average transaction ($${mean.toFixed(2)}).`,
      };
    }
  }

  return { isFlagged: false, flagReason: null };
};

module.exports = { detectAnomaly };
