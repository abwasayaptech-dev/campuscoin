const mongoose = require('mongoose');
const Insight = require('../models/Insight');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

/**
 * Generate dynamic, multi-dimensional AI insight narrative and behavioral analytics
 * @param {string} userId
 * @param {string} monthStr e.g. "2026-09"
 * @param {boolean} forceRefresh whether to force recalculation
 * @returns {Promise<Object>}
 */
const generateMonthlyInsight = async (userId, monthStr, forceRefresh = false) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Parse target month dates
  const [year, monthNum] = monthStr.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

  // Previous month dates
  const prevStartDate = new Date(year, monthNum - 2, 1);
  const prevEndDate = new Date(year, monthNum - 1, 0, 23, 59, 59, 999);

  // Fetch user profile for baseline allowance
  const user = await User.findById(userObjectId);
  const baselineAllowance = user?.monthlyAllowanceBaseline || 500;
  const savingsGoal = user?.monthlySavingsGoal || 100;
  const userName = user?.name ? user.name.split(' ')[0] : 'Student';

  // 1. Current Month Aggregation: Categories
  const currentCatTotals = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        type: 'expense',
        isDeleted: false,
        date: { $gte: startDate, $lte: endDate },
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
      $group: {
        _id: '$category.name',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  // 2. Fetch all raw expense transactions for behavioral pattern analysis
  const currentTransactions = await Transaction.find({
    userId: userObjectId,
    type: 'expense',
    isDeleted: false,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });

  // 3. Previous Month Aggregation for comparative baseline
  const prevCatTotals = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        type: 'expense',
        isDeleted: false,
        date: { $gte: prevStartDate, $lte: prevEndDate },
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
      $group: {
        _id: '$category.name',
        total: { $sum: '$amount' },
      },
    },
  ]);

  const prevMap = {};
  prevCatTotals.forEach((c) => {
    prevMap[c._id] = c.total;
  });

  // 4. Income Aggregation
  const incomeAgg = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        type: 'income',
        isDeleted: false,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const totalIncome = (incomeAgg[0] ? incomeAgg[0].total : 0) || baselineAllowance;
  let currentTotalExpense = 0;
  let topCategory = '';
  let topCategoryAmount = 0;

  const growthFlags = [];

  currentCatTotals.forEach((c) => {
    currentTotalExpense += c.total;
    if (c.total > topCategoryAmount) {
      topCategoryAmount = c.total;
      topCategory = c._id;
    }

    const prevVal = prevMap[c._id] || 0;
    if (prevVal > 0) {
      const growth = Math.round(((c.total - prevVal) / prevVal) * 100);
      if (growth >= 20 && c.total >= 30) {
        let advice = `Keep an eye on ${c._id}; try establishing a fixed weekly allocation limit.`;
        if (c._id.toLowerCase().includes('food')) {
          advice = `Food spending surged by ${growth}%. Packing lunch twice a week can trim this back by ~$50.`;
        } else if (c._id.toLowerCase().includes('entertainment') || c._id.toLowerCase().includes('social')) {
          advice = `Entertainment rose ${growth}%. Look out for student campus free-admission nights and group discounts.`;
        } else if (c._id.toLowerCase().includes('transport')) {
          advice = `Transport rose ${growth}%. Explore student semester transit passes or rideshare carpool splitting.`;
        } else if (c._id.toLowerCase().includes('sub')) {
          advice = `Subscriptions increased ${growth}%. Audit shared student accounts (Spotify, Hulu, ChatGPT) to split fees.`;
        }

        growthFlags.push({
          category: c._id,
          growthPercentage: growth,
          currentSpend: Math.round(c.total),
          previousSpend: Math.round(prevVal),
          advice,
        });
      }
    }
  });

  // 5. Behavioral Analytics Calculation
  let microSpendTotal = 0;
  let microSpendCount = 0;
  let weekendSpendTotal = 0;
  let weekdaySpendTotal = 0;

  currentTransactions.forEach((tx) => {
    // Micro-spends (< $10)
    if (tx.amount < 10) {
      microSpendTotal += tx.amount;
      microSpendCount += 1;
    }

    // Weekend vs Weekday analysis (0 = Sun, 5 = Fri, 6 = Sat)
    const day = new Date(tx.date).getDay();
    if (day === 0 || day === 5 || day === 6) {
      weekendSpendTotal += tx.amount;
    } else {
      weekdaySpendTotal += tx.amount;
    }
  });

  const weekendSpendPercent = currentTotalExpense > 0
    ? Math.round((weekendSpendTotal / currentTotalExpense) * 100)
    : 0;

  const topCategoryPercent = currentTotalExpense > 0
    ? Math.round((topCategoryAmount / currentTotalExpense) * 100)
    : 0;

  const netSavings = totalIncome - currentTotalExpense;
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

  // Days in month
  const totalDaysInMonth = new Date(year, monthNum, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthNum - 1;
  const daysElapsed = isCurrentMonth ? Math.max(1, today.getDate()) : totalDaysInMonth;
  const daysRemaining = totalDaysInMonth - daysElapsed;
  const dailyBurnRate = Math.round((currentTotalExpense / daysElapsed) * 100) / 100;

  // 6. Dynamic Financial Health Score (0-100)
  let healthScoreVal = 75;

  if (netSavings > 0) healthScoreVal += 12;
  else if (netSavings < -100) healthScoreVal -= 20;
  else if (netSavings < 0) healthScoreVal -= 10;

  if (savingsRate >= 20) healthScoreVal += 8;
  if (topCategoryPercent > 55) healthScoreVal -= 8; // high concentration risk
  if (microSpendCount > 15) healthScoreVal -= 5; // coffee/snack micro-drain

  healthScoreVal = Math.min(98, Math.max(25, healthScoreVal));

  let healthVibe = 'Chill & Steady 🍜';
  let healthStatus = 'healthy';

  if (healthScoreVal >= 85) {
    healthVibe = 'Campus Royalty 👑 (Super Healthy)';
    healthStatus = 'healthy';
  } else if (healthScoreVal >= 68) {
    healthVibe = 'Chill & Steady 🍜 (Balanced Buffer)';
    healthStatus = 'healthy';
  } else if (healthScoreVal >= 48) {
    healthVibe = 'Tight Allowance Buffer ⚠️ (Watchful)';
    healthStatus = 'warning';
  } else {
    healthVibe = 'Ramen Survival Mode 🚨 (Over Budget)';
    healthStatus = 'critical';
  }

  // 7. Dynamic Conversational AI Narrative Synthesis
  const monthName = startDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  
  // Paragraph 1: Cash Flow Snapshot
  let paragraph1 = `During ${monthName}, you recorded a total of $${currentTotalExpense.toFixed(
    2
  )} in campus expenditures against $${totalIncome.toFixed(2)} in total allowance and income. `;

  if (netSavings > 0) {
    paragraph1 += `You achieved a strong positive cash flow with $${netSavings.toFixed(
      2
    )} retained in net savings (${savingsRate}% savings rate) — exceeding your baseline targets! 🎯`;
  } else if (netSavings < 0) {
    paragraph1 += `Your expenditures exceeded your available inflows by $${Math.abs(netSavings).toFixed(
      2
    )}. Setting strict category caps for high-frequency categories will help restore your emergency buffer. ⚠️`;
  } else {
    paragraph1 += `You broke exactly even this month with zero net deficit.`;
  }

  // Paragraph 2: Behavioral Patterns & Concentration
  let paragraph2 = '';
  if (topCategory) {
    paragraph2 += `Your single largest expense driver was "${topCategory}", accounting for $${topCategoryAmount.toFixed(
      2
    )} (${topCategoryPercent}% of all disbursements). `;
  }

  if (microSpendCount >= 3) {
    paragraph2 += `Our behavioral scanner identified ${microSpendCount} micro-purchases under $10 (campus coffees, snacks, quick items) totaling $${microSpendTotal.toFixed(
      2
    )}. `;
  }

  if (weekendSpendPercent >= 45) {
    paragraph2 += `Weekend spending represented ${weekendSpendPercent}% of your disbursements, highlighting social leisure as a key variable.`;
  } else {
    paragraph2 += `Weekday disbursements were steadily distributed across lecture and study routines.`;
  }

  // Paragraph 3: Forward Runway & Projections
  let paragraph3 = '';
  if (isCurrentMonth && daysRemaining > 0) {
    const remainingAllowance = Math.max(0, totalIncome - currentTotalExpense);
    const safeDailyRunway = Math.round((remainingAllowance / daysRemaining) * 100) / 100;
    paragraph3 = `With ${daysRemaining} days remaining in ${monthName}, your daily spending velocity is running at $${dailyBurnRate.toFixed(
      2
    )}/day. To finish the semester month comfortably, maintain a target cap of ~$${safeDailyRunway.toFixed(
      2
    )}/day.`;
  } else {
    paragraph3 = `Overall, your average daily burn rate concluded at $${dailyBurnRate.toFixed(
      2
    )}/day across the ${totalDaysInMonth}-day cycle.`;
  }

  const summaryText = `${paragraph1}\n\n${paragraph2}\n\n${paragraph3}`;

  // 8. Dynamic Tailored Actionable Nudges
  const actionableNudges = [];

  if (microSpendTotal >= 20) {
    actionableNudges.push({
      title: 'Dorm Cold Brew & Snack Station',
      description: `You spent $${microSpendTotal.toFixed(
        2
      )} across ${microSpendCount} quick micro-transactions. Brewing coffee in your dorm twice a week can recover ~$35/month.`,
      potentialSavings: 35,
      category: 'Food',
      priority: 'high',
      icon: 'Coffee',
    });
  }

  if (weekendSpendPercent >= 40) {
    actionableNudges.push({
      title: 'Weekend Social Cap Allocation',
      description: `Weekend spending accounts for ${weekendSpendPercent}% of your monthly total. Setting a dedicated Friday-Sunday cash limit prevents surprise deficit spikes.`,
      potentialSavings: 45,
      category: 'Entertainment',
      priority: 'medium',
      icon: 'PartyPopper',
    });
  }

  if (topCategoryPercent >= 40 && topCategory) {
    actionableNudges.push({
      title: `Optimize Primary Category: ${topCategory}`,
      description: `${topCategory} takes up ${topCategoryPercent}% of all funds. Reviewing 2 large recurring expenses in this category can easily free up $30–$60.`,
      potentialSavings: 40,
      category: topCategory,
      priority: 'high',
      icon: 'Target',
    });
  }

  actionableNudges.push({
    title: 'Student Discount & Shared Subscription Audit',
    description: 'Verify all active software tools, streaming apps, and transit passes are utilizing 50% university student pricing.',
    potentialSavings: 20,
    category: 'Subscriptions',
    priority: 'low',
    icon: 'Percent',
  });

  const tipText = growthFlags.length > 0
    ? `${growthFlags[0].category} experienced the highest surge (+${growthFlags[0].growthPercentage}%). ${growthFlags[0].advice}`
    : (actionableNudges[0]?.description || 'Maintaining steady expenditures across your primary categories safeguards your semester buffer.');

  // 9. Upsert into MongoDB
  const updateData = {
    userId: userObjectId,
    month: monthStr,
    summaryText,
    tipText,
    growthFlags,
    healthScore: {
      score: healthScoreVal,
      vibe: healthVibe,
      status: healthStatus,
    },
    metrics: {
      totalExpense: currentTotalExpense,
      totalIncome,
      netSavings,
      savingsRate,
      dailyBurnRate,
      microSpendTotal,
      microSpendCount,
      weekendSpendPercent,
      topCategory: topCategory || 'General',
      topCategoryPercent,
    },
    actionableNudges,
    generatedAt: new Date(),
  };

  const updatedInsight = await Insight.findOneAndUpdate(
    { userId: userObjectId, month: monthStr },
    { $set: updateData },
    { new: true, upsert: true }
  );

  return updatedInsight;
};

module.exports = { generateMonthlyInsight };
