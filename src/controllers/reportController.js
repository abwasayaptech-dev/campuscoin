const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Category = require('../models/Category');
const { generatePersonalizedTips } = require('../services/tipEngineService');
const { forecastNextMonthSpending } = require('../services/forecastService');
const { sendEmail } = require('../config/mailer');

// @desc    Get complete dashboard summary metrics
// @route   GET /api/reports/dashboard
// @access  Private
const getDashboardSummary = async (req, res, next) => {
  try {
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Current Month Aggregates
    const currentAgg = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          isDeleted: false,
          date: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    let currentIncome = 0;
    let currentExpense = 0;
    currentAgg.forEach((item) => {
      if (item._id === 'income') currentIncome = item.total;
      if (item._id === 'expense') currentExpense = item.total;
    });

    // Previous Month Aggregates
    const prevAgg = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          isDeleted: false,
          date: { $gte: startOfPrevMonth, $lte: endOfPrevMonth },
        },
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
        },
      },
    ]);

    let prevIncome = 0;
    let prevExpense = 0;
    prevAgg.forEach((item) => {
      if (item._id === 'income') prevIncome = item.total;
      if (item._id === 'expense') prevExpense = item.total;
    });

    const netSavings = currentIncome - currentExpense;
    const savingsRate = currentIncome > 0 ? Math.round((netSavings / currentIncome) * 100) : 0;

    // Top Category this month
    const topCatAgg = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
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
          color: { $first: '$category.color' },
          icon: { $first: '$category.icon' },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 1 },
    ]);

    const topCategory = topCatAgg[0]
      ? {
          name: topCatAgg[0]._id,
          total: topCatAgg[0].total,
          color: topCatAgg[0].color,
          icon: topCatAgg[0].icon,
          percentage: currentExpense > 0 ? Math.round((topCatAgg[0].total / currentExpense) * 100) : 0,
        }
      : null;

    // Recent 5 Transactions
    const recentTransactions = await Transaction.find({
      userId: req.user.id,
      isDeleted: false,
    })
      .populate('categoryId', 'name icon color type')
      .sort({ date: -1, createdAt: -1 })
      .limit(5);

    // Active Budgets with Progress
    const budgets = await Budget.find({
      userId: req.user.id,
      month: currentMonthStr,
    }).populate('categoryId', 'name icon color type');

    const catSpendAgg = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          type: 'expense',
          isDeleted: false,
          date: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: '$categoryId',
          spent: { $sum: '$amount' },
        },
      },
    ]);

    const spendByCat = {};
    catSpendAgg.forEach((c) => {
      spendByCat[c._id.toString()] = c.spent;
    });

    const budgetProgress = budgets.map((b) => {
      const spent = b.categoryId ? spendByCat[b.categoryId._id.toString()] || 0 : 0;
      return {
        _id: b._id,
        category: b.categoryId ? b.categoryId.name : 'Unknown',
        color: b.categoryId ? b.categoryId.color : '#10b981',
        icon: b.categoryId ? b.categoryId.icon : 'tag',
        limit: b.limitAmount,
        spent: Math.round(spent * 100) / 100,
        percentage: b.limitAmount > 0 ? Math.round((spent / b.limitAmount) * 100) : 0,
      };
    });

    // Top 3 Saving Tips
    const tips = await generatePersonalizedTips(req.user.id, req.user);
    const topTips = tips.slice(0, 3);

    // Forecast
    const forecast = await forecastNextMonthSpending(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        currentMonth: currentMonthStr,
        metrics: {
          income: currentIncome,
          expense: currentExpense,
          netSavings,
          savingsRate,
          monthlyAllowanceBaseline: req.user.monthlyAllowanceBaseline || 500,
          monthlySavingsGoal: req.user.monthlySavingsGoal || 100,
          prevMonth: {
            income: prevIncome,
            expense: prevExpense,
            netSavings: prevIncome - prevExpense,
          },
        },
        topCategory,
        budgetProgress,
        topTips,
        recentTransactions,
        forecast,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get detailed monthly analytics reports (charts)
// @route   GET /api/reports/analytics
// @access  Private
const getMonthlyReports = async (req, res, next) => {
  try {
    const { month, categoryId, type } = req.query;
    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [year, monthNum] = targetMonth.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    // 1. Category Breakdown (Pie/Donut)
    const categoryPieQuery = {
      userId: req.user._id,
      isDeleted: false,
      date: { $gte: startDate, $lte: endDate },
    };

    if (type) categoryPieQuery.type = type;
    else categoryPieQuery.type = 'expense';

    const categoryBreakdown = await Transaction.aggregate([
      { $match: categoryPieQuery },
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
          _id: '$category._id',
          name: { $first: '$category.name' },
          color: { $first: '$category.color' },
          icon: { $first: '$category.icon' },
          value: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { value: -1 } },
    ]);

    // 2. Income vs Expense — Last 6 Months (Bar Chart)
    const sixMonthsAgo = new Date(year, monthNum - 6, 1);
    const sixMonthAgg = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          isDeleted: false,
          date: { $gte: sixMonthsAgo, $lte: endDate },
        },
      },
      {
        $project: {
          amount: 1,
          type: 1,
          monthStr: { $dateToString: { format: '%Y-%m', date: '$date' } },
        },
      },
      {
        $group: {
          _id: { month: '$monthStr', type: '$type' },
          total: { $sum: '$amount' },
        },
      },
    ]);

    const sixMonthsDataMap = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, monthNum - 1 - i, 1);
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short' });
      sixMonthsDataMap[mStr] = { month: mStr, label, income: 0, expense: 0, savings: 0 };
    }

    sixMonthAgg.forEach((item) => {
      const m = item._id.month;
      if (sixMonthsDataMap[m]) {
        if (item._id.type === 'income') sixMonthsDataMap[m].income = Math.round(item.total);
        if (item._id.type === 'expense') sixMonthsDataMap[m].expense = Math.round(item.total);
      }
    });

    Object.values(sixMonthsDataMap).forEach((val) => {
      val.savings = val.income - val.expense;
    });

    const incomeVsExpense6Months = Object.values(sixMonthsDataMap);

    // 3. Daily Summary for target month (Line Chart)
    const dailyAgg = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          isDeleted: false,
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $project: {
          amount: 1,
          type: 1,
          day: { $dateToString: { format: '%d', date: '$date' } },
        },
      },
      {
        $group: {
          _id: { day: '$day', type: '$type' },
          total: { $sum: '$amount' },
        },
      },
    ]);

    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const dailyMap = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      dailyMap[dayStr] = { day: `Day ${day}`, expense: 0, income: 0 };
    }

    dailyAgg.forEach((item) => {
      const d = item._id.day;
      if (dailyMap[d]) {
        if (item._id.type === 'expense') dailyMap[d].expense = Math.round(item.total * 100) / 100;
        if (item._id.type === 'income') dailyMap[d].income = Math.round(item.total * 100) / 100;
      }
    });

    const dailyTrend = Object.values(dailyMap);

    // 4. Weekly Summary for target month
    const weeklyAgg = [
      { week: 'Week 1 (Days 1-7)', expense: 0, income: 0 },
      { week: 'Week 2 (Days 8-14)', expense: 0, income: 0 },
      { week: 'Week 3 (Days 15-21)', expense: 0, income: 0 },
      { week: 'Week 4+ (Days 22+)', expense: 0, income: 0 },
    ];

    dailyTrend.forEach((item, idx) => {
      const dayNum = idx + 1;
      let targetWeek = 3;
      if (dayNum <= 7) targetWeek = 0;
      else if (dayNum <= 14) targetWeek = 1;
      else if (dayNum <= 21) targetWeek = 2;

      weeklyAgg[targetWeek].expense += item.expense;
      weeklyAgg[targetWeek].income += item.income;
    });

    weeklyAgg.forEach((w) => {
      w.expense = Math.round(w.expense * 100) / 100;
      w.income = Math.round(w.income * 100) / 100;
    });

    res.status(200).json({
      success: true,
      month: targetMonth,
      data: {
        categoryBreakdown,
        incomeVsExpense6Months,
        dailyTrend,
        weeklySummary: weeklyAgg,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Email monthly report to user
// @route   POST /api/reports/email
// @access  Private
const emailReport = async (req, res, next) => {
  try {
    const { month } = req.body;
    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [year, monthNum] = targetMonth.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    const transactions = await Transaction.find({
      userId: req.user.id,
      isDeleted: false,
      date: { $gte: startDate, $lte: endDate },
    }).populate('categoryId', 'name type');

    let totalIncome = 0;
    let totalExpense = 0;
    transactions.forEach((t) => {
      if (t.type === 'income') totalIncome += t.amount;
      else totalExpense += t.amount;
    });

    const netSavings = totalIncome - totalExpense;

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #10b981;">Campus Coin — Monthly Financial Statement</h2>
        <p>Hi ${req.user.name},</p>
        <p>Here is your financial summary report for <strong>${targetMonth}</strong>:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
            <th style="padding: 10px; text-align: left;">Category</th>
            <th style="padding: 10px; text-align: right;">Amount</th>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Total Income</td>
            <td style="padding: 10px; text-align: right; color: #10b981; font-weight: bold;">$${totalIncome.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Total Expenses</td>
            <td style="padding: 10px; text-align: right; color: #ef4444; font-weight: bold;">$${totalExpense.toFixed(2)}</td>
          </tr>
          <tr style="background: #f0fdf4;">
            <td style="padding: 10px; font-weight: bold;">Net Savings</td>
            <td style="padding: 10px; text-align: right; font-weight: bold; color: ${netSavings >= 0 ? '#10b981' : '#ef4444'};">
              $${netSavings.toFixed(2)}
            </td>
          </tr>
        </table>
        <p>Total transactions logged: <strong>${transactions.length}</strong></p>
        <p style="color: #64748b; font-size: 13px;">Keep tracking your transactions on Campus Coin to maintain financial mastery throughout college!</p>
      </div>
    `;

    const result = await sendEmail({
      to: req.user.email,
      subject: `Campus Coin Statement: ${targetMonth}`,
      text: `Your ${targetMonth} summary: Total Income: $${totalIncome.toFixed(2)}, Total Expenses: $${totalExpense.toFixed(2)}, Net Savings: $${netSavings.toFixed(2)}.`,
      html: emailHtml,
    });

    res.status(200).json({
      success: true,
      message: 'Monthly financial report dispatched to your email address.',
      previewUrl: result.previewUrl || null,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboardSummary,
  getMonthlyReports,
  emailReport,
};
