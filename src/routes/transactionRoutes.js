const express = require('express');
const {
  getTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
  bulkImportCsv,
} = require('../controllers/transactionController');
const { protect } = require('../middleware/authMiddleware');
const { uploadCsv } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.use(protect);

router.post('/import-csv', uploadCsv.single('file'), bulkImportCsv);
router.put('/:id/restore', restoreTransaction);

router.route('/')
  .get(getTransactions)
  .post(createTransaction);

router.route('/:id')
  .get(getTransactionById)
  .put(updateTransaction)
  .delete(deleteTransaction);

module.exports = router;
