const mongoose = require('mongoose');
const Tip = require('../models/Tip');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');

/**
 * Generate fully dynamic, data-driven saving tips based on user's live spending data
 * @param {string|ObjectId} userId
 * @param {Object} user
 * @returns {Promise<Array>} List of ranked dynamic tips
 */
const generatePersonalizedTips = async (userId, user) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 1. Current month expenses aggregated by category
  const currentExpenses = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        type: 'expense',
        isDeleted: false,
        date: { $gte: startOfMonth, $lte: endOfMonth },
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

  // 2. Fetch raw transactions for behavioral scanning
  const allTxs = await Transaction.find({
    userId: userObjectId,
    type: 'expense',
    isDeleted: false,
    date: { $gte: startOfMonth, $lte: endOfMonth },
  });

  const catMap = {};
  let totalExpense = 0;
  let topCategoryName = '';
  let topCategoryAmount = 0;

  currentExpenses.forEach((c) => {
    catMap[c._id] = c.total;
    totalExpense += c.total;
    if (c.total > topCategoryAmount) {
      topCategoryAmount = c.total;
      topCategoryName = c._id;
    }
  });

  // 3. Check active budgets & threshold breaches
  const budgets = await Budget.find({
    userId: userObjectId,
    month: currentMonthStr,
  }).populate('categoryId');

  const budgetBreaches = [];
  budgets.forEach((b) => {
    if (b.categoryId) {
      const spent = catMap[b.categoryId.name] || 0;
      const limit = b.limitAmount;
      const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      if (pct >= 80) {
        budgetBreaches.push({
          category: b.categoryId.name,
          spent: Math.round(spent * 100) / 100,
          limit,
          pct,
          isExceeded: pct >= 100,
          overAmount: Math.max(0, Math.round((spent - limit) * 100) / 100),
        });
      }
    }
  });

  // 4. Behavioral calculations (micro-spends, weekend spend)
  let microSpendTotal = 0;
  let microSpendCount = 0;
  let weekendSpendTotal = 0;

  allTxs.forEach((tx) => {
    if (tx.amount < 10) {
      microSpendTotal += tx.amount;
      microSpendCount += 1;
    }
    const day = new Date(tx.date).getDay();
    if (day === 0 || day === 5 || day === 6) {
      weekendSpendTotal += tx.amount;
    }
  });

  const candidateTips = [];

  // Tip 1: DYNAMIC TOP SPENDING LEAK IDENTIFIER (Primary focus!)
  if (topCategoryName && topCategoryAmount > 0) {
    const topPct = totalExpense > 0 ? Math.round((topCategoryAmount / totalExpense) * 100) : 0;
    const potentialSaving = Math.round(topCategoryAmount * 0.2);

    let specificAdvice = `Trimming this single category by 20% would keep an extra ~$${potentialSaving}/month in your pocket.`;
    if (topCategoryName.toLowerCase().includes('food') || topCategoryName.toLowerCase().includes('dining')) {
      specificAdvice = `Meal-prepping 2 dorm lunches per week and sharing bulk groceries can trim ~$${potentialSaving}/month effortlessly.`;
    } else if (topCategoryName.toLowerCase().includes('transport') || topCategoryName.toLowerCase().includes('ride')) {
      specificAdvice = `Utilize university student semester transit passes or rideshare carpool groups to cut ~$${potentialSaving}/month.`;
    } else if (topCategoryName.toLowerCase().includes('academic') || topCategoryName.toLowerCase().includes('book')) {
      specificAdvice = `Check campus library digital reserves, shared PDF course readers, or student resale boards before retail buying.`;
    } else if (topCategoryName.toLowerCase().includes('entertainment') || topCategoryName.toLowerCase().includes('social')) {
      specificAdvice = `Look out for campus student free-entry nights and split group outing tabs to save ~$${potentialSaving}/month.`;
    }

    candidateTips.push({
      text: `Top Spending Leak: You're spending the most money on "${topCategoryName}" ($${topCategoryAmount.toFixed(
        2
      )}, representing ${topPct}% of your total spending). ${specificAdvice}`,
      category: topCategoryName,
      potentialSavings: potentialSaving || 40,
      impactScore: 98,
    });
  }

  // Tip 2: BUDGET OVERAGE & WARNING MITIGATION (High Urgency)
  if (budgetBreaches.length > 0) {
    budgetBreaches.forEach((b) => {
      if (b.isExceeded) {
        candidateTips.push({
          text: `🚨 Budget Overrun in ${b.category}: You have spent $${b.spent.toFixed(2)} (${b.pct}%), exceeding your $${b.limit} cap by $${b.overAmount.toFixed(2)}. Freeze non-essential purchases in ${b.category} immediately to prevent semester deficit!`,
          category: b.category,
          potentialSavings: Math.round(b.overAmount) || 30,
          impactScore: 95,
        });
      } else {
        candidateTips.push({
          text: `⚠️ Budget Warning: You have reached ${b.pct}% of your ${b.category} budget ($${b.spent.toFixed(2)} / $${b.limit}). Only $${(b.limit - b.spent).toFixed(2)} remaining this month.`,
          category: b.category,
          potentialSavings: Math.round(b.spent * 0.15) || 20,
          impactScore: 88,
        });
      }
    });
  }

  // Tip 3: MICRO-SPEND SCANNER
  if (microSpendCount >= 2 && microSpendTotal >= 15) {
    const microSaving = Math.round(microSpendTotal * 0.5);
    candidateTips.push({
      text: `Micro-Drain Detected: You logged ${microSpendCount} small purchases under $10 (coffees, vending, quick snacks) totaling $${microSpendTotal.toFixed(
        2
      )}. Brewing coffee in your dorm can recover ~$${microSaving}/month.`,
      category: 'Food',
      potentialSavings: microSaving,
      impactScore: 82,
    });
  }

  // Tip 4: WEEKEND LEISURE SPENDING
  const weekendPct = totalExpense > 0 ? Math.round((weekendSpendTotal / totalExpense) * 100) : 0;
  if (weekendPct >= 35 && weekendSpendTotal >= 40) {
    const weekendSaving = Math.round(weekendSpendTotal * 0.25);
    candidateTips.push({
      text: `Weekend Social Spike: ${weekendPct}% of your disbursements ($${weekendSpendTotal.toFixed(
        2
      )}) happen on Friday–Sunday. Setting a dedicated weekend entertainment limit can save you ~$${weekendSaving}/month.`,
      category: 'Entertainment',
      potentialSavings: weekendSaving,
      impactScore: 78,
    });
  }

  // Tip 5: SUBSCRIPTIONS & STUDENT DISCOUNT AUDIT
  const subSpend = catMap['Subscriptions'] || catMap['subscriptions'] || 0;
  if (subSpend > 15) {
    candidateTips.push({
      text: `Digital Subscriptions: You spent $${subSpend.toFixed(
        2
      )} on subscriptions this month. Ensure you are taking advantage of 50% university student pricing (Spotify Student, Prime Student, GitHub Pro).`,
      category: 'Subscriptions',
      potentialSavings: Math.round(subSpend * 0.4) || 15,
      impactScore: 74,
    });
  }

  // Tip 6: MONTHLY SAVINGS TARGET GAP OR CELEBRATION
  const savingsGoal = user?.monthlySavingsGoal || 100;
  const baselineAllowance = user?.monthlyAllowanceBaseline || 500;
  const currentNet = baselineAllowance - totalExpense;

  if (currentNet > 0 && currentNet >= savingsGoal) {
    candidateTips.push({
      text: `Target Reached: You are currently on track to hit your $${savingsGoal} monthly savings target with $${currentNet.toFixed(
        2
      )} remaining runway. Consider allocating the surplus to an emergency buffer fund.`,
      category: 'General',
      potentialSavings: savingsGoal,
      impactScore: 65,
    });
  } else if (totalExpense > 50) {
    const deficit = Math.round(savingsGoal - Math.max(0, currentNet));
    if (deficit > 0) {
      candidateTips.push({
        text: `Savings Goal Gap: You are currently ~$${deficit} away from your $${savingsGoal} monthly savings target. Cutting discretionary micro-spends can easily close this gap before month-end.`,
        category: 'General',
        potentialSavings: deficit,
        impactScore: 85,
      });
    }
  }

  // Smart Fallback if fresh user
  if (candidateTips.length === 0) {
    candidateTips.push({
      text: `Track every daily micro-transaction! Logging small expenses like campus coffee or laundry keeps your runway safe and triggers automated savings recommendations.`,
      category: 'General',
      potentialSavings: 35,
      impactScore: 50,
    });
  }

  // Clear unpinned old tips so fresh dynamic tips replace them
  await Tip.deleteMany({
    userId: userObjectId,
    status: 'active',
  });

  // Persist fresh dynamic tips
  for (const t of candidateTips) {
    const existing = await Tip.findOne({
      userId: userObjectId,
      text: t.text,
      status: { $in: ['pinned', 'dismissed'] },
    });

    if (!existing) {
      await Tip.create({
        userId: userObjectId,
        text: t.text,
        category: t.category,
        potentialSavings: t.potentialSavings,
        impactScore: t.impactScore,
        status: 'active',
        source: 'system',
      });
    }
  }

  // Return user's top active & pinned tips
  return await Tip.find({
    userId: userObjectId,
    status: { $in: ['active', 'pinned'] },
  }).sort({ status: -1, impactScore: -1 });
};

module.exports = { generatePersonalizedTips };
