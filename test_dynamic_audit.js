const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');

dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./src/models/User');
const Category = require('./src/models/Category');
const Transaction = require('./src/models/Transaction');
const Budget = require('./src/models/Budget');
const Insight = require('./src/models/Insight');
const Tip = require('./src/models/Tip');
const Notification = require('./src/models/Notification');
const Announcement = require('./src/models/Announcement');

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    let bodyPayload = null;
    const finalHeaders = { ...(options.headers || {}) };

    if (postData !== null && postData !== undefined) {
      if (typeof postData === 'object' && !(postData instanceof Buffer)) {
        bodyPayload = Buffer.from(JSON.stringify(postData), 'utf-8');
        if (!finalHeaders['Content-Type']) {
          finalHeaders['Content-Type'] = 'application/json';
        }
        finalHeaders['Content-Length'] = bodyPayload.length;
      } else if (postData instanceof Buffer) {
        bodyPayload = postData;
        finalHeaders['Content-Length'] = bodyPayload.length;
      }
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: options.path,
        method: options.method || 'GET',
        headers: finalHeaders,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            parsed = rawData;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (bodyPayload) req.write(bodyPayload);
    req.end();
  });
}

function api(method, endpoint, body = null, token = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return makeRequest({ path: `/api${endpoint}`, method, headers }, body);
}

async function runDynamicAudit() {
  console.log('========================================================');
  console.log('🔍 Starting End-to-End Dynamic Audit & Verification');
  console.log('========================================================\n');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus_coin');

  const testResults = [];

  function recordTest(name, passed, details) {
    testResults.push({ name, passed, details });
    console.log(`${passed ? '✅' : '❌'} ${name}: ${details}`);
  }

  try {
    // 1. Fresh Student Registration & Zero-State Verification
    const student1Email = `fresh_student_${Date.now()}@campuscoin.edu`;
    const regRes = await api('POST', '/auth/register', {
      name: 'Dynamic Student One',
      email: student1Email,
      password: 'Password123!',
      academicYear: 'Sophomore',
      monthlyAllowanceBaseline: 600,
      monthlySavingsGoal: 150,
      currency: 'USD',
    });

    const token1 = regRes.data?.token;
    const user1Id = regRes.data?.user?._id;

    recordTest(
      'Fresh Student Registration',
      regRes.status === 201 && !!token1,
      `Registered new student ${student1Email}`
    );

    // Dashboard Zero-State Check
    const dash0Res = await api('GET', '/reports/dashboard', null, token1);
    const m0 = dash0Res.data?.data?.metrics;
    const isZeroState =
      m0?.income === 0 &&
      m0?.expense === 0 &&
      m0?.netSavings === 0 &&
      dash0Res.data?.data?.recentTransactions?.length === 0;

    recordTest(
      'Dashboard Zero-State Integrity',
      isZeroState,
      `Metrics correctly start at 0 (Income: $${m0?.income}, Expense: $${m0?.expense}, Net: $${m0?.netSavings})`
    );

    // 2. Dynamic Categories Loading (Defaults from DB)
    const catRes = await api('GET', '/categories', null, token1);
    const categories = catRes.data?.data || [];
    const foodCat = categories.find((c) => c.name.toLowerCase().includes('food')) || categories[0];
    const incomeCat = categories.find((c) => c.type === 'income') || categories[categories.length - 1];

    recordTest(
      'Dynamic Categories DB Fetch',
      categories.length >= 10 && !!foodCat,
      `Loaded ${categories.length} database categories (Default + Custom scoped)`
    );

    // 3. Add Income & Expenses and Verify Live Recalculation
    const incomeRes = await api(
      'POST',
      '/transactions',
      {
        amount: 800,
        type: 'income',
        categoryId: incomeCat._id,
        description: 'Monthly Family Allowance',
        date: new Date().toISOString().split('T')[0],
      },
      token1
    );

    const expense1Res = await api(
      'POST',
      '/transactions',
      {
        amount: 120,
        type: 'expense',
        categoryId: foodCat._id,
        description: 'Campus Dining Hall Meal Plan',
        date: new Date().toISOString().split('T')[0],
      },
      token1
    );

    const dash1Res = await api('GET', '/reports/dashboard', null, token1);
    const m1 = dash1Res.data?.data?.metrics;
    const topCat1 = dash1Res.data?.data?.topCategory;

    const calculationsAccurate =
      m1?.income === 800 &&
      m1?.expense === 120 &&
      m1?.netSavings === 680 &&
      topCat1?.name === foodCat.name &&
      topCat1?.total === 120;

    recordTest(
      'Dynamic Income/Expense & Top Category Computation',
      calculationsAccurate,
      `Income: $${m1?.income}, Expense: $${m1?.expense}, Net Savings: $${m1?.netSavings}, Top Category: ${topCat1?.name} ($${topCat1?.total})`
    );

    // 4. Budget Creation, Consumption Calculation & Alerting
    const currentMonth = new Date().toISOString().slice(0, 7);
    const budgetRes = await api(
      'POST',
      '/budgets',
      {
        categoryId: foodCat._id,
        limitAmount: 100, // Limit is $100, but spent is $120 -> 120% exceeded!
        month: currentMonth,
      },
      token1
    );

    const budgetListRes = await api('GET', `/budgets?month=${currentMonth}`, null, token1);
    const activeBudgets = budgetListRes.data?.data || [];
    const foodBudget = activeBudgets.find((b) => b.categoryId?._id === foodCat._id || b.categoryId === foodCat._id);

    const budgetAccurate = foodBudget && foodBudget.spent === 120 && foodBudget.limitAmount === 100;

    recordTest(
      'Dynamic Budget Progress & Over-Budget Detection',
      budgetAccurate,
      `Budget Limit: $${foodBudget?.limitAmount}, Actual Spent: $${foodBudget?.spent} (${Math.round((foodBudget?.spent / foodBudget?.limitAmount) * 100)}%)`
    );

    // 5. Dynamic AI Monthly Insight Generation & History Persistence
    const insightGenRes = await api('GET', `/insights?month=${currentMonth}&refresh=true`, null, token1);
    const insightData = insightGenRes.data?.data;
    const insightHistoryRes = await api('GET', '/insights/history', null, token1);
    const historyList = insightHistoryRes.data?.data || [];

    const insightPersisted =
      insightGenRes.status === 200 &&
      insightData?.month === currentMonth &&
      historyList.some((h) => h._id === insightData?._id);

    recordTest(
      'AI Monthly Insight Generation & Database History',
      insightPersisted,
      `Insight generated (Health Score: ${insightData?.healthScore?.score}, Vibe: ${insightData?.healthScore?.vibe}) and saved to history (${historyList.length} records)`
    );

    // 6. Saving Tips Engine - Dynamic Generation, Pinning & DB Persistence
    const tipsRes = await api('GET', '/tips', null, token1);
    const tipsList = tipsRes.data?.data || [];
    const firstTip = tipsList[0];

    let tipPinnedPersisted = false;
    if (firstTip) {
      await api('PATCH', `/tips/${firstTip._id}/status`, { status: 'pinned' }, token1);
      const updatedTipsRes = await api('GET', '/tips', null, token1);
      const pinnedTip = updatedTipsRes.data?.data?.find((t) => t._id === firstTip._id);
      tipPinnedPersisted = pinnedTip?.status === 'pinned';
    }

    recordTest(
      'Dynamic Saving Tips & Pinned State DB Persistence',
      tipsList.length > 0 && tipPinnedPersisted,
      `Generated ${tipsList.length} dynamic spending tips. Successfully pinned tip "${firstTip?.text?.slice(0, 40)}..."`
    );

    // 7. Multi-Tenant Data Isolation (Student 2 cannot see Student 1's records)
    const student2Email = `student2_${Date.now()}@campuscoin.edu`;
    const reg2Res = await api('POST', '/auth/register', {
      name: 'Dynamic Student Two',
      email: student2Email,
      password: 'Password123!',
      academicYear: 'Senior',
      monthlyAllowanceBaseline: 900,
      monthlySavingsGoal: 200,
    });
    const token2 = reg2Res.data?.token;

    const tx2Res = await api('GET', '/transactions', null, token2);
    const budgets2Res = await api('GET', `/budgets?month=${currentMonth}`, null, token2);

    const isolationVerified =
      tx2Res.data?.data?.length === 0 &&
      budgets2Res.data?.data?.length === 0;

    recordTest(
      'Strict Multi-Tenant Tenancy Isolation',
      isolationVerified,
      `Student 2 (0 transactions, 0 budgets) isolated from Student 1 data`
    );

    // 8. Admin Telemetry, Broadcast & Dynamic Live Stats
    let admin = await User.findOne({ role: 'admin' });
    const jwt = require('jsonwebtoken');
    const adminToken = jwt.sign(
      { id: admin._id, role: 'admin' },
      process.env.JWT_SECRET || 'campus_coin_super_secret_jwt_key_2026'
    );

    const adminStatsRes = await api('GET', '/admin/stats', null, adminToken);
    const adminStats = adminStatsRes.data?.data;

    const statsDynamic =
      adminStats?.totalUsers >= 2 &&
      adminStats?.totalTransactions >= 2 &&
      adminStats?.totalExpenseVolume >= 120 &&
      adminStats?.mostUsedCategories?.length > 0;

    recordTest(
      'Admin Platform Telemetry & Live Aggregates',
      statsDynamic,
      `Real DB counts: ${adminStats?.totalUsers} users, ${adminStats?.totalTransactions} txs, $${adminStats?.totalExpenseVolume} expense vol`
    );

    // 9. Admin Broadcast Notification -> Delivered to Student Bell
    const broadcastRes = await api(
      'POST',
      '/admin/announcements',
      {
        title: 'Spring Career Fair 2026',
        message: 'On-campus internships and student discounts available this Thursday at Student Union.',
        type: 'info',
      },
      adminToken
    );

    const studentNotifsRes = await api('GET', '/notifications', null, token1);
    const studentNotifs = studentNotifsRes.data?.data || [];
    const broadcastDelivered = studentNotifs.some((n) => n.title.includes('Spring Career Fair'));

    recordTest(
      'Admin Broadcast Notification Delivery to Student Bell',
      broadcastDelivered,
      `Broadcast delivered directly to Student 1 notification bell (Unread count: ${studentNotifsRes.data?.unreadCount})`
    );

    // Summary
    console.log('\n========================================================');
    console.log('📊 AUDIT RESULTS SUMMARY');
    console.log('========================================================');
    const totalPassed = testResults.filter((r) => r.passed).length;
    console.log(`Total Scenarios: ${testResults.length} | Passed: ${totalPassed} | Failed: ${testResults.length - totalPassed}`);

    // Cleanup
    await User.deleteMany({ email: { $in: [student1Email, student2Email] } });
    await Transaction.deleteMany({ userId: { $in: [user1Id, reg2Res.data?.user?._id] } });
    await Budget.deleteMany({ userId: { $in: [user1Id, reg2Res.data?.user?._id] } });
    await Insight.deleteMany({ userId: { $in: [user1Id, reg2Res.data?.user?._id] } });
    await Tip.deleteMany({ userId: { $in: [user1Id, reg2Res.data?.user?._id] } });
    await Notification.deleteMany({
      $or: [
        { userId: { $in: [user1Id, reg2Res.data?.user?._id] } },
        { title: { $regex: 'Spring Career Fair', $options: 'i' } },
      ],
    });
    await Announcement.deleteMany({ title: { $regex: 'Spring Career Fair', $options: 'i' } });

    await mongoose.disconnect();
    process.exit(totalPassed === testResults.length ? 0 : 1);
  } catch (err) {
    console.error('Audit script fatal error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runDynamicAudit();
