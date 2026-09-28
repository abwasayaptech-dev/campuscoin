const { categorizeDescription, logCorrection } = require('../services/aiCategorizationService');

// @desc    Suggest category for transaction description as user types
// @route   POST /api/ai/suggest-category
// @access  Private
const suggestCategory = async (req, res, next) => {
  try {
    const { description, type } = req.body;

    if (!description || description.trim().length === 0) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    const suggestion = await categorizeDescription(
      description,
      type || 'expense',
      req.user ? req.user.id : null
    );

    res.status(200).json({
      success: true,
      data: suggestion,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Log feedback when user corrects AI category suggestion
// @route   POST /api/ai/correct-category
// @access  Private
const learnCorrection = async (req, res, next) => {
  try {
    const { description, suggestedCategory, correctedCategory } = req.body;

    if (description && correctedCategory) {
      await logCorrection(req.user.id, description, suggestedCategory, correctedCategory);
    }

    res.status(200).json({
      success: true,
      message: 'Correction logged and learned for future suggestions.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  suggestCategory,
  learnCorrection,
};
