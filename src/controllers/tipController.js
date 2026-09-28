const Tip = require('../models/Tip');
const { generatePersonalizedTips } = require('../services/tipEngineService');

// @desc    Get personalized saving tips
// @route   GET /api/tips
// @access  Private
const getTips = async (req, res, next) => {
  try {
    const tips = await generatePersonalizedTips(req.user.id, req.user);
    res.status(200).json({
      success: true,
      count: tips.length,
      data: tips,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update tip status (pin or dismiss)
// @route   PUT /api/tips/:id/status
// @access  Private
const updateTipStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'pinned', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    const tip = await Tip.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!tip) {
      return res.status(404).json({ success: false, message: 'Tip not found' });
    }

    tip.status = status;
    await tip.save();

    res.status(200).json({
      success: true,
      message: `Tip updated to ${status}`,
      data: tip,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getTips,
  updateTipStatus,
};
