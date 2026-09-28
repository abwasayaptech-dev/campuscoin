const Insight = require('../models/Insight');
const { generateMonthlyInsight } = require('../services/insightEngineService');

// @desc    Get AI monthly insight for given month
// @route   GET /api/insights
// @access  Private
const getInsight = async (req, res, next) => {
  try {
    const { month, refresh } = req.query;
    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const forceRefresh = refresh === 'true' || refresh === true;
    const insight = await generateMonthlyInsight(req.user.id, targetMonth, forceRefresh);

    res.status(200).json({
      success: true,
      data: insight,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get insight history across past months
// @route   GET /api/insights/history
// @access  Private
const getInsightHistory = async (req, res, next) => {
  try {
    const history = await Insight.find({ userId: req.user.id }).sort({ month: -1 });

    res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Toggle bookmark on an insight
// @route   PUT /api/insights/:id/bookmark
// @access  Private
const toggleBookmarkInsight = async (req, res, next) => {
  try {
    const insight = await Insight.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!insight) {
      return res.status(404).json({ success: false, message: 'Insight not found' });
    }

    insight.isBookmarked = !insight.isBookmarked;
    await insight.save();

    res.status(200).json({
      success: true,
      isBookmarked: insight.isBookmarked,
      message: insight.isBookmarked ? 'Insight bookmarked' : 'Bookmark removed',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getInsight,
  getInsightHistory,
  toggleBookmarkInsight,
};
