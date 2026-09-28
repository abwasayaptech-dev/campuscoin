const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');

const initCronJobs = () => {
  // Run once daily at 00:05 (or every 10 minutes in dev)
  cron.schedule('5 0 * * *', async () => {
    console.log('[Cron Job] Running daily check for recurring transactions...');
    try {
      await processRecurringTransactions();
    } catch (err) {
      console.error('[Cron Job Error] Failed to process recurring entries:', err);
    }
  });

  console.log('[Cron] Scheduled recurring transaction processor initialized');
};

const processRecurringTransactions = async () => {
  const now = new Date();
  const dueTransactions = await Transaction.find({
    isRecurring: true,
    isDeleted: false,
    recurrenceRule: { $ne: 'none' },
    nextRecurrenceDate: { $lte: now },
  });

  console.log(`[Cron] Found ${dueTransactions.length} recurring transactions due for processing`);

  for (const tx of dueTransactions) {
    // 1. Create duplicate new transaction for current date
    const newTx = await Transaction.create({
      userId: tx.userId,
      categoryId: tx.categoryId,
      amount: tx.amount,
      type: tx.type,
      description: `${tx.description} (Auto Recurring)`,
      date: new Date(),
      isRecurring: false,
      recurrenceRule: 'none',
      notes: `Generated automatically from recurring rule: ${tx.recurrenceRule}`,
    });

    // 2. Compute next recurrence date for parent
    const nextDate = new Date(tx.nextRecurrenceDate || now);
    if (tx.recurrenceRule === 'daily') {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (tx.recurrenceRule === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (tx.recurrenceRule === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }

    tx.nextRecurrenceDate = nextDate;
    await tx.save();

    // 3. Notify student
    await Notification.create({
      userId: tx.userId,
      type: 'recurring',
      title: 'Recurring Transaction Posted',
      message: `Your recurring ${tx.type} "${tx.description}" of $${tx.amount} was automatically posted.`,
      data: { transactionId: newTx._id },
    });
  }
};

module.exports = { initCronJobs, processRecurringTransactions };
