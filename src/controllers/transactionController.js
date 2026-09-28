const fs = require('fs');
const csv = require('csv-parser');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const Budget = require('../models/Budget');
const Notification = require('../models/Notification');
const { detectAnomaly } = require('../services/anomalyService');
const { categorizeDescription, logCorrection } = require('../services/aiCategorizationService');
const { checkAndDispatchBudgetAlert } = require('../services/budgetAlertService');

// @desc    Get transactions with filtering, pagination, and sorting
// @route   GET /api/transactions
// @access  Private
const getTransactions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 15,
      type,
      category,
      startDate,
      endDate,
      search,
      sortBy = 'date',
      sortOrder = 'desc',
      includeDeleted = 'false',
    } = req.query;

    const query = { userId: req.user.id };

    if (includeDeleted !== 'true') {
      query.isDeleted = false;
    }

    if (type && ['income', 'expense'].includes(type)) {
      query.type = type;
    }

    if (category) {
      query.categoryId = category;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (search) {
      query.description = { $regex: search, $options: 'i' };
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('categoryId', 'name icon color type')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum),
      Transaction.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: transactions.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      data: transactions,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single transaction
// @route   GET /api/transactions/:id
// @access  Private
const getTransactionById = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user.id,
    }).populate('categoryId', 'name icon color type');

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.status(200).json({ success: true, data: transaction });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new transaction
// @route   POST /api/transactions
// @access  Private
const createTransaction = async (req, res, next) => {
  try {
    const {
      categoryId,
      amount,
      type,
      description,
      date,
      isRecurring,
      recurrenceRule,
      notes,
      aiSuggestedCategory,
    } = req.body;

    // Verify category exists
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(400).json({ success: false, message: 'Valid category is required' });
    }

    // Anomaly detection
    const anomaly = await detectAnomaly(
      {
        userId: req.user.id,
        amount: Number(amount),
        description,
        categoryId,
        date: date || new Date(),
        type,
      },
      req.user
    );

    // Compute next recurrence date if applicable
    let nextRecurrenceDate = null;
    if (isRecurring && recurrenceRule && recurrenceRule !== 'none') {
      const txDate = date ? new Date(date) : new Date();
      nextRecurrenceDate = new Date(txDate);
      if (recurrenceRule === 'daily') nextRecurrenceDate.setDate(nextRecurrenceDate.getDate() + 1);
      if (recurrenceRule === 'weekly') nextRecurrenceDate.setDate(nextRecurrenceDate.getDate() + 7);
      if (recurrenceRule === 'monthly') nextRecurrenceDate.setMonth(nextRecurrenceDate.getMonth() + 1);
    }

    const transaction = await Transaction.create({
      userId: req.user.id,
      categoryId,
      amount: Number(amount),
      type,
      description: description.trim(),
      date: date || new Date(),
      isRecurring: Boolean(isRecurring),
      recurrenceRule: isRecurring ? recurrenceRule : 'none',
      nextRecurrenceDate,
      notes: notes || '',
      aiSuggestedCategory: aiSuggestedCategory || null,
      isFlagged: anomaly.isFlagged,
      flagReason: anomaly.flagReason,
    });

    // Populate category details
    await transaction.populate('categoryId', 'name icon color type');

    // Check if user changed AI suggested category to teach the heuristic model
    if (aiSuggestedCategory && aiSuggestedCategory !== category.name) {
      await logCorrection(req.user.id, description, aiSuggestedCategory, category.name);
    }

    // Check budget alert
    let budgetAlert = null;
    if (type === 'expense') {
      budgetAlert = await checkAndDispatchBudgetAlert(req.user.id, categoryId, transaction.date);
    }

    // If anomaly flagged, emit in-app notification
    if (anomaly.isFlagged) {
      await Notification.create({
        userId: req.user.id,
        type: 'anomaly',
        title: '⚠️ Unusual Transaction Detected',
        message: anomaly.flagReason,
        data: { transactionId: transaction._id },
      });
    }

    res.status(201).json({
      success: true,
      data: transaction,
      anomaly: anomaly.isFlagged ? anomaly.flagReason : null,
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

// @desc    Update transaction
// @route   PUT /api/transactions/:id
// @access  Private
const updateTransaction = async (req, res, next) => {
  try {
    let transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const { categoryId, amount, type, description, date, isRecurring, recurrenceRule, notes } = req.body;

    if (categoryId) transaction.categoryId = categoryId;
    if (amount !== undefined) transaction.amount = Number(amount);
    if (type) transaction.type = type;
    if (description) transaction.description = description.trim();
    if (date) transaction.date = new Date(date);
    if (notes !== undefined) transaction.notes = notes;
    if (isRecurring !== undefined) transaction.isRecurring = Boolean(isRecurring);
    if (recurrenceRule) transaction.recurrenceRule = recurrenceRule;

    await transaction.save();
    await transaction.populate('categoryId', 'name icon color type');

    // Check budget thresholds after update
    let budgetAlert = null;
    if (transaction.type === 'expense') {
      budgetAlert = await checkAndDispatchBudgetAlert(req.user.id, transaction.categoryId, transaction.date);
    }

    res.status(200).json({
      success: true,
      data: transaction,
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

// @desc    Soft delete transaction (retains full history)
// @route   DELETE /api/transactions/:id
// @access  Private
const deleteTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    transaction.isDeleted = true;
    transaction.deletedAt = new Date();
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Transaction moved to trash (soft deleted). Full history retained.',
      id: transaction._id,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Restore soft deleted transaction
// @route   PUT /api/transactions/:id/restore
// @access  Private
const restoreTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user.id,
      isDeleted: true,
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Deleted transaction not found' });
    }

    transaction.isDeleted = false;
    transaction.deletedAt = null;
    await transaction.save();
    await transaction.populate('categoryId', 'name icon color type');

    res.status(200).json({
      success: true,
      message: 'Transaction restored successfully',
      data: transaction,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Bulk CSV Import of historical transactions with AI categorization
// @route   POST /api/transactions/import-csv
// @access  Private
const bulkImportCsv = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please upload a CSV file' });
  }

  const results = [];
  const errors = [];
  const filePath = req.file.path;

  try {
    // Fetch all user & default categories for matching
    const allCategories = await Category.find({
      $or: [{ userId: null }, { isDefault: true }, { userId: req.user.id }],
    });

    const categoryMap = {};
    allCategories.forEach((c) => {
      categoryMap[c.name.toLowerCase()] = c;
    });

    const defaultExpenseCat = allCategories.find((c) => c.type === 'expense' && c.name === 'Miscellaneous') || allCategories[0];
    const defaultIncomeCat = allCategories.find((c) => c.type === 'income' && c.name === 'Other Income') || allCategories[0];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          fs.unlinkSync(filePath); // Clean temp upload
        } catch (e) {
          // ignore
        }

        let importedCount = 0;
        const insertedTransactions = [];

        for (let i = 0; i < results.length; i++) {
          const row = results[i];
          const rawAmount = row.Amount || row.amount || row.Total || row.total;
          const rawDesc = row.Description || row.description || row.Title || row.title || row.Memo || row.memo || 'CSV Import';
          const rawType = (row.Type || row.type || 'expense').toLowerCase();
          const rawCategory = row.Category || row.category;
          const rawDate = row.Date || row.date || new Date();

          const amount = parseFloat(rawAmount);
          if (isNaN(amount) || amount <= 0) {
            errors.push({ row: i + 1, error: 'Invalid or missing amount' });
            continue;
          }

          const type = rawType.includes('inc') ? 'income' : 'expense';

          // Match or AI suggest category
          let matchedCategory = null;
          let aiSuggested = null;

          if (rawCategory && categoryMap[rawCategory.trim().toLowerCase()]) {
            matchedCategory = categoryMap[rawCategory.trim().toLowerCase()];
          } else {
            // Run AI batch categorization
            const aiResult = await categorizeDescription(rawDesc, type, req.user.id);
            aiSuggested = aiResult.categoryName;
            matchedCategory = categoryMap[aiSuggested.toLowerCase()] || (type === 'income' ? defaultIncomeCat : defaultExpenseCat);
          }

          insertedTransactions.push({
            userId: req.user.id,
            categoryId: matchedCategory._id,
            amount,
            type,
            description: rawDesc.trim(),
            date: new Date(rawDate),
            aiSuggestedCategory: aiSuggested,
            notes: 'Imported via CSV batch',
          });

          importedCount++;
        }

        if (insertedTransactions.length > 0) {
          await Transaction.insertMany(insertedTransactions);
        }

        res.status(200).json({
          success: true,
          message: `Successfully imported ${importedCount} transactions.`,
          importedCount,
          skippedCount: errors.length,
          errors: errors.slice(0, 10),
        });
      })
      .on('error', (err) => {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {}
        next(err);
      });
  } catch (err) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {}
    next(err);
  }
};

module.exports = {
  getTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
  bulkImportCsv,
};
