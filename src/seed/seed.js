const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Insight = require('../models/Insight');
const Tip = require('../models/Tip');
const Notification = require('../models/Notification');
const Announcement = require('../models/Announcement');
const CorrectionLog = require('../models/CorrectionLog');

const seedData = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/campus_coin';
    await mongoose.connect(mongoUri);
    console.log(`[Seed] Connected to MongoDB at ${mongoUri}`);

    // Clear existing collections
    console.log('[Seed] Clearing existing collections...');
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Transaction.deleteMany({}),
      Budget.deleteMany({}),
      Insight.deleteMany({}),
      Tip.deleteMany({}),
      Notification.deleteMany({}),
      Announcement.deleteMany({}),
      CorrectionLog.deleteMany({}),
    ]);

    // 1. Create Default Categories
    console.log('[Seed] Seeding default categories...');
    const defaultCategories = [
      // Income
      { name: 'Allowance', type: 'income', isDefault: true, icon: 'wallet', color: '#10b981' },
      { name: 'Part-time Job', type: 'income', isDefault: true, icon: 'briefcase', color: '#06b6d4' },
      { name: 'Scholarship', type: 'income', isDefault: true, icon: 'graduation-cap', color: '#8b5cf6' },
      { name: 'Gift', type: 'income', isDefault: true, icon: 'gift', color: '#ec4899' },
      { name: 'Other Income', type: 'income', isDefault: true, icon: 'plus-circle', color: '#14b8a6' },
      // Expense
      { name: 'Food', type: 'expense', isDefault: true, icon: 'utensils', color: '#f97316' },
      { name: 'Transport', type: 'expense', isDefault: true, icon: 'bus', color: '#3b82f6' },
      { name: 'Hostel/Rent', type: 'expense', isDefault: true, icon: 'home', color: '#6366f1' },
      { name: 'Academics', type: 'expense', isDefault: true, icon: 'book-open', color: '#84cc16' },
      { name: 'Subscriptions', type: 'expense', isDefault: true, icon: 'film', color: '#a855f7' },
      { name: 'Entertainment', type: 'expense', isDefault: true, icon: 'gamepad-2', color: '#eab308' },
      { name: 'Miscellaneous', type: 'expense', isDefault: true, icon: 'shopping-bag', color: '#64748b' },
    ];

    const createdCategories = await Category.insertMany(defaultCategories);
    const catMap = {};
    createdCategories.forEach((c) => {
      catMap[c.name] = c._id;
    });

    // 2. Create Users (Admin & Students)
    console.log('[Seed] Creating admin and demo students...');
    const adminUser = await User.create({
      name: 'System Administrator',
      email: 'admin@campuscoin.edu',
      passwordHash: 'Admin123!',
      role: 'admin',
      academicYear: 'Other',
      monthlyAllowanceBaseline: 0,
      monthlySavingsGoal: 0,
      themePreference: {
        preset: 'fresh-mint',
        mode: 'light',
        fontScale: 'medium',
      },
    });

    const demoStudent = await User.create({
      name: 'Alex Rivera',
      email: 'student@campuscoin.edu',
      passwordHash: 'Student123!',
      role: 'student',
      academicYear: 'Sophomore',
      monthlyAllowanceBaseline: 650,
      monthlySavingsGoal: 150,
      themePreference: {
        preset: 'fresh-mint',
        mode: 'light',
        fontScale: 'medium',
        customColors: {
          primary: '#10b981',
          secondary: '#f59e0b',
          bg: '#f8fafc',
          surface: '#ffffff',
          text: '#0f172a',
        },
      },
      hasCompletedOnboarding: true,
    });

    const student2 = await User.create({
      name: 'Sarah Chen',
      email: 'sarah@campuscoin.edu',
      passwordHash: 'Student123!',
      role: 'student',
      academicYear: 'Junior',
      monthlyAllowanceBaseline: 500,
      monthlySavingsGoal: 100,
      themePreference: {
        preset: 'sunset-coral',
        mode: 'light',
        fontScale: 'medium',
      },
      hasCompletedOnboarding: false,
    });

    // Create a custom category for Alex
    const gymCategory = await Category.create({
      name: 'Campus Gym & Fitness',
      type: 'expense',
      isDefault: false,
      userId: demoStudent._id,
      icon: 'dumbbell',
      color: '#0284c7',
    });

    // 3. Generate Historical & Current Transactions for Alex Rivera
    console.log('[Seed] Generating transactions...');
    const now = new Date();
    const transactionsToInsert = [];

    // Helper to generate date offsets
    const daysAgo = (days) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      return d;
    };

    // Past Months (Months -5 to -1)
    for (let m = 5; m >= 1; m--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 5);

      // Monthly Allowance income
      transactionsToInsert.push({
        userId: demoStudent._id,
        categoryId: catMap['Allowance'],
        amount: 550,
        type: 'income',
        description: 'Monthly Family Allowance',
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
        isRecurring: true,
        recurrenceRule: 'monthly',
        notes: 'Direct wire from parents',
      });

      // Part-time job income
      transactionsToInsert.push({
        userId: demoStudent._id,
        categoryId: catMap['Part-time Job'],
        amount: 220,
        type: 'income',
        description: 'Campus Tutoring Center Paycheck',
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 15),
        isRecurring: false,
        notes: 'Math department tutoring (11 hours)',
      });

      // Rent / Dorm
      transactionsToInsert.push({
        userId: demoStudent._id,
        categoryId: catMap['Hostel/Rent'],
        amount: 280,
        type: 'expense',
        description: 'Dorm Shared Room Installment',
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 3),
        isRecurring: true,
        recurrenceRule: 'monthly',
      });

      // Food expenses
      transactionsToInsert.push({
        userId: demoStudent._id,
        categoryId: catMap['Food'],
        amount: 110 + m * 8,
        type: 'expense',
        description: 'Campus Cafeteria & Grocery Run',
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 10),
      });

      // Transport
      transactionsToInsert.push({
        userId: demoStudent._id,
        categoryId: catMap['Transport'],
        amount: 35 + m * 3,
        type: 'expense',
        description: 'City Bus & Metro Monthly Pass',
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 12),
      });

      // Subscriptions
      transactionsToInsert.push({
        userId: demoStudent._id,
        categoryId: catMap['Subscriptions'],
        amount: 14.99,
        type: 'expense',
        description: 'Spotify Student + Hulu Bundle',
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 18),
        isRecurring: true,
        recurrenceRule: 'monthly',
      });

      // Academics
      transactionsToInsert.push({
        userId: demoStudent._id,
        categoryId: catMap['Academics'],
        amount: 45 + m * 5,
        type: 'expense',
        description: 'Textbooks & Course Reader Copies',
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 22),
      });

      // Entertainment
      transactionsToInsert.push({
        userId: demoStudent._id,
        categoryId: catMap['Entertainment'],
        amount: 30 + m * 4,
        type: 'expense',
        description: 'Weekend Movie & Student Lounge Bowling',
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 25),
      });
    }

    // Current Month Transactions (Real-time realistic spread)
    const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);

    // Current Month Incomes
    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Allowance'],
      amount: 650,
      type: 'income',
      description: 'Monthly Family Allowance',
      date: new Date(now.getFullYear(), now.getMonth(), 1),
      isRecurring: true,
      recurrenceRule: 'monthly',
      nextRecurrenceDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      notes: 'Semester baseline support',
    });

    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Part-time Job'],
      amount: 240,
      type: 'income',
      description: 'Campus Tutoring Center Paycheck',
      date: daysAgo(10),
      isRecurring: false,
      notes: 'Peer tutoring bi-weekly stipend',
    });

    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Scholarship'],
      amount: 150,
      type: 'income',
      description: 'Merit Book Stipend Grant',
      date: daysAgo(18),
      isRecurring: false,
    });

    // Current Month Expenses
    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Hostel/Rent'],
      amount: 280,
      type: 'expense',
      description: 'Campus Hostel Housing Installment',
      date: new Date(now.getFullYear(), now.getMonth(), 2),
      isRecurring: true,
      recurrenceRule: 'monthly',
    });

    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Food'],
      amount: 42.5,
      type: 'expense',
      description: 'Campus Cafe Lunch & Espresso',
      date: daysAgo(1),
      aiSuggestedCategory: 'Food',
      notes: 'Study group lunch with Maya and Jordan',
    });

    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Food'],
      amount: 68.2,
      type: 'expense',
      description: 'Weekly Trader Joe Grocery Haul',
      date: daysAgo(5),
      aiSuggestedCategory: 'Food',
    });

    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Transport'],
      amount: 28.0,
      type: 'expense',
      description: 'Campus Commuter Bus Card Refill',
      date: daysAgo(7),
      aiSuggestedCategory: 'Transport',
    });

    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Academics'],
      amount: 54.0,
      type: 'expense',
      description: 'Calculus III Study Guide & Lab Notebook',
      date: daysAgo(12),
      aiSuggestedCategory: 'Academics',
    });

    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Subscriptions'],
      amount: 10.99,
      type: 'expense',
      description: 'Spotify Student + Hulu Subscription',
      date: daysAgo(14),
      isRecurring: true,
      recurrenceRule: 'monthly',
      nextRecurrenceDate: new Date(now.getFullYear(), now.getMonth() + 1, 14),
      aiSuggestedCategory: 'Subscriptions',
    });

    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Subscriptions'],
      amount: 14.99,
      type: 'expense',
      description: 'ChatGPT Plus Student Research License',
      date: daysAgo(16),
      aiSuggestedCategory: 'Subscriptions',
    });

    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Entertainment'],
      amount: 32.5,
      type: 'expense',
      description: 'Friday Night Cinema Tickets & Popcorn',
      date: daysAgo(3),
      aiSuggestedCategory: 'Entertainment',
    });

    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: gymCategory._id,
      amount: 25.0,
      type: 'expense',
      description: 'University Recreation Locker & Towel Rental',
      date: daysAgo(15),
    });

    // Sample flagged anomaly transaction
    transactionsToInsert.push({
      userId: demoStudent._id,
      categoryId: catMap['Miscellaneous'],
      amount: 185.0,
      type: 'expense',
      description: 'Emergency Laptop Charger & Surge Protector',
      date: daysAgo(2),
      isFlagged: true,
      flagReason: 'High expense alert: $185 is over 3x your average transaction.',
      notes: 'Replaced broken OEM charger before midterm exams',
    });

    await Transaction.insertMany(transactionsToInsert);

    // 4. Create Category Budgets for Alex
    console.log('[Seed] Setting up budgets...');
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const budgets = [
      { userId: demoStudent._id, categoryId: catMap['Food'], month: currentMonthStr, limitAmount: 180 },
      { userId: demoStudent._id, categoryId: catMap['Transport'], month: currentMonthStr, limitAmount: 50 },
      { userId: demoStudent._id, categoryId: catMap['Hostel/Rent'], month: currentMonthStr, limitAmount: 300 },
      { userId: demoStudent._id, categoryId: catMap['Academics'], month: currentMonthStr, limitAmount: 75 },
      { userId: demoStudent._id, categoryId: catMap['Subscriptions'], month: currentMonthStr, limitAmount: 35 },
      { userId: demoStudent._id, categoryId: catMap['Entertainment'], month: currentMonthStr, limitAmount: 60 },
    ];
    await Budget.insertMany(budgets);

    // 5. Create AI Insights
    console.log('[Seed] Generating monthly insights...');
    await Insight.create({
      userId: demoStudent._id,
      month: currentMonthStr,
      summaryText: `In ${now.toLocaleString('default', { month: 'long', year: 'numeric' })}, you recorded $1,040.00 in income and $716.18 in total expenses. Your primary expense was "Hostel/Rent" ($280.00), followed closely by "Food" ($110.70). You maintained a healthy positive cash flow with $323.82 in net savings, on pace to hit your $150.00 monthly goal! 🎯`,
      tipText: 'Food spending has trended slightly higher than last week. Consider leveraging campus meal hall meal passes on heavy class days.',
      growthFlags: [
        {
          category: 'Miscellaneous',
          growthPercentage: 110,
          currentSpend: 185,
          previousSpend: 40,
          advice: 'Emergency electronics purchase increased this category. Plan an emergency gadget buffer in your savings goal.',
        },
      ],
      isBookmarked: true,
      generatedAt: new Date(),
    });

    // 6. Create Personalized Saving Tips
    console.log('[Seed] Seeding personalized tips...');
    await Tip.insertMany([
      {
        userId: demoStudent._id,
        text: 'Prepping 2 dorm meals per week instead of takeout can save you ~$65/month.',
        category: 'Food',
        potentialSavings: 65,
        impactScore: 92,
        status: 'pinned',
        source: 'system',
      },
      {
        userId: demoStudent._id,
        text: 'Look into the university semester pass for the commuter transit line to shave $15/month off individual reloads.',
        category: 'Transport',
        potentialSavings: 15,
        impactScore: 84,
        status: 'active',
        source: 'system',
      },
      {
        userId: demoStudent._id,
        text: 'Switch to the verified student tiers for Spotify and GitHub Student Developer Pack to save $22/month.',
        category: 'Subscriptions',
        potentialSavings: 22,
        impactScore: 78,
        status: 'active',
        source: 'ai',
      },
    ]);

    // 7. Create Notifications
    console.log('[Seed] Seeding notifications...');
    await Notification.insertMany([
      {
        userId: demoStudent._id,
        type: 'anomaly',
        title: '⚠️ Unusual Transaction Detected',
        message: 'High expense alert: $185 for "Emergency Laptop Charger & Surge Protector" is over 3x your average transaction.',
        read: false,
      },
      {
        userId: demoStudent._id,
        type: 'budget_warning',
        title: '⚠️ Budget Warning: Food',
        message: 'You have used 62% of your $180 Food budget for the month.',
        read: true,
      },
      {
        userId: demoStudent._id,
        type: 'announcement',
        title: 'Welcome to Campus Coin 🎓',
        message: 'Set your monthly baseline allowance and explore the 6 preset themes or create your own custom palette!',
        read: true,
      },
    ]);

    // 8. Create Admin Announcements
    console.log('[Seed] Seeding announcements...');
    await Announcement.insertMany([
      {
        title: 'Spring Semester Financial Literacy Workshops',
        message: 'Join the campus finance club this Thursday at 5 PM in Hall B for tax filing and student credit tips!',
        type: 'info',
        isActive: true,
        createdBy: adminUser._id,
      },
      {
        title: 'Campus Bookstore Buyback Window Open',
        message: 'Return and sell your used textbooks by the 15th to receive up to 50% cash back into your student allowance.',
        type: 'tip',
        isActive: true,
        createdBy: adminUser._id,
      },
    ]);

    // 9. Create AI Correction Logs
    console.log('[Seed] Seeding AI correction memory...');
    await CorrectionLog.create({
      userId: demoStudent._id,
      description: 'campus store notebook',
      suggestedCategory: 'Miscellaneous',
      correctedCategory: 'Academics',
    });

    console.log('\n======================================================');
    console.log('✅ Campus Coin Database Seeded Successfully!');
    console.log('======================================================');
    console.log('Demo Credentials:');
    console.log('  Student: student@campuscoin.edu / Student123!');
    console.log('  Admin:   admin@campuscoin.edu   / Admin123!');
    console.log('  Student: sarah@campuscoin.edu   / Student123!');
    console.log('======================================================\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
