const Transaction = require('../models/Transaction');

/**
 * Predict next month spending based on historical transaction data
 * @param {string} userId
 * @returns {Promise<{ predictedExpense: number, trend: string, confidence: string, categoryForecasts: Array }>}
 */
const forecastNextMonthSpending = async (userId) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  // Group expenses by month and category
  const monthlyStats = await Transaction.aggregate([
    {
      $match: {
        userId,
        type: 'expense',
        isDeleted: false,
        date: { $gte: sixMonthsAgo },
      },
    },
    {
      $lookup: {
        from: 'categories',
        localField: 'categoryId',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
    {
      $project: {
        amount: 1,
        monthStr: { $dateToString: { format: '%Y-%m', date: '$date' } },
        categoryName: '$category.name',
        categoryColor: '$category.color',
      },
    },
    {
      $group: {
        _id: { month: '$monthStr', category: '$categoryName' },
        totalAmount: { $sum: '$amount' },
        categoryColor: { $first: '$categoryColor' },
      },
    },
  ]);

  // Aggregate by month
  const monthTotals = {};
  const catTotals = {};

  monthlyStats.forEach((item) => {
    const m = item._id.month;
    const cat = item._id.category;
    monthTotals[m] = (monthTotals[m] || 0) + item.totalAmount;

    if (!catTotals[cat]) {
      catTotals[cat] = { total: 0, count: 0, color: item.categoryColor };
    }
    catTotals[cat].total += item.totalAmount;
    catTotals[cat].count += 1;
  });

  const sortedMonths = Object.keys(monthTotals).sort();
  const yValues = sortedMonths.map((m) => monthTotals[m]);

  if (yValues.length === 0) {
    return {
      predictedExpense: 0,
      trend: 'insufficient_data',
      trendPercentage: 0,
      confidence: 'low',
      categoryForecasts: [],
      dataPoints: 0,
    };
  }

  // Simple Linear Regression: y = a + b * x
  const n = yValues.length;
  let predictedExpense = 0;
  let trend = 'stable';
  let trendPercentage = 0;

  if (n === 1) {
    predictedExpense = Math.round(yValues[0]);
  } else {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += yValues[i];
      sumXY += i * yValues[i];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
    const intercept = (sumY - slope * sumX) / n;

    // Next month is at index n
    const rawPrediction = intercept + slope * n;
    predictedExpense = Math.max(0, Math.round(rawPrediction));

    const latest = yValues[n - 1];
    trendPercentage = latest > 0 ? Math.round(((predictedExpense - latest) / latest) * 100) : 0;
    if (trendPercentage > 5) trend = 'increasing';
    else if (trendPercentage < -5) trend = 'decreasing';
    else trend = 'stable';
  }

  // Category projections (weighted average)
  const categoryForecasts = Object.keys(catTotals).map((catName) => {
    const avg = catTotals[catName].total / catTotals[catName].count;
    return {
      category: catName,
      color: catTotals[catName].color,
      predictedAmount: Math.round(avg),
    };
  }).sort((a, b) => b.predictedAmount - a.predictedAmount);

  return {
    predictedExpense,
    trend,
    trendPercentage,
    confidence: n >= 3 ? 'high' : n >= 2 ? 'medium' : 'low',
    dataPoints: n,
    categoryForecasts,
    historicalMonths: sortedMonths.map((m) => ({
      month: m,
      total: Math.round(monthTotals[m]),
    })),
  };
};

module.exports = { forecastNextMonthSpending };
