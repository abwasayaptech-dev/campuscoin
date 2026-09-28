const crypto = require('crypto');
const User = require('../models/User');
const { sendEmail } = require('../config/mailer');

// @desc    Register a new student
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    const { name, email, password, academicYear, monthlyAllowanceBaseline, monthlySavingsGoal, currency } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email address already exists.',
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      passwordHash: password,
      role: 'student',
      currency: currency ? currency.toUpperCase() : 'USD',
      academicYear: academicYear || 'Freshman',
      monthlyAllowanceBaseline: monthlyAllowanceBaseline !== undefined ? Number(monthlyAllowanceBaseline) : 500,
      monthlySavingsGoal: monthlySavingsGoal !== undefined ? Number(monthlySavingsGoal) : 100,
      greetingPreference: {
        style: 'time-based',
        customText: '',
        customSubtext: '',
      },
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
    });

    const token = user.getSignedJwtToken();

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        academicYear: user.academicYear,
        monthlyAllowanceBaseline: user.monthlyAllowanceBaseline,
        monthlySavingsGoal: user.monthlySavingsGoal,
        greetingPreference: user.greetingPreference,
        avatarUrl: user.avatarUrl || '',
        currency: user.currency || 'USD',
        themePreference: user.themePreference,
        hasCompletedOnboarding: user.hasCompletedOnboarding,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Student login
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid email and password',
      });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
      });
    }

    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        academicYear: user.academicYear,
        monthlyAllowanceBaseline: user.monthlyAllowanceBaseline,
        monthlySavingsGoal: user.monthlySavingsGoal,
        greetingPreference: user.greetingPreference || { style: 'time-based', customText: '', customSubtext: '' },
        themePreference: user.themePreference,
        avatarUrl: user.avatarUrl || '',
        currency: user.currency || 'USD',
        hasCompletedOnboarding: user.hasCompletedOnboarding,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Admin login
// @route   POST /api/auth/admin/login
// @access  Public
const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid email and password',
      });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrator credentials',
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not possess administrator privileges.',
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrator credentials',
      });
    }

    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        currency: user.currency || 'USD',
        greetingPreference: user.greetingPreference,
        themePreference: user.themePreference,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res, next) => {
  try {
    const fieldsToUpdate = {};
    const { name, academicYear, monthlyAllowanceBaseline, monthlySavingsGoal, greetingPreference, avatarUrl, currency } = req.body;

    if (name) fieldsToUpdate.name = name;
    if (academicYear) fieldsToUpdate.academicYear = academicYear;
    if (currency) fieldsToUpdate.currency = currency.toUpperCase();
    if (monthlyAllowanceBaseline !== undefined) fieldsToUpdate.monthlyAllowanceBaseline = Number(monthlyAllowanceBaseline);
    if (monthlySavingsGoal !== undefined) fieldsToUpdate.monthlySavingsGoal = Number(monthlySavingsGoal);
    if (avatarUrl !== undefined) {
      if (req.user.role !== 'student' && avatarUrl !== '') {
        return res.status(403).json({
          success: false,
          message: 'Profile photos are exclusively supported for student accounts.',
        });
      }
      fieldsToUpdate.avatarUrl = avatarUrl;
    }
    if (greetingPreference) {
      fieldsToUpdate.greetingPreference = {
        style: greetingPreference.style || 'time-based',
        customText: greetingPreference.customText || '',
        customSubtext: greetingPreference.customSubtext || '',
      };
    }

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Upload student profile avatar image
// @route   POST /api/auth/profile/avatar
// @access  Private (Student only)
const uploadStudentAvatar = async (req, res, next) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Profile photo upload is exclusively for student accounts.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an image file (PNG, JPG, JPEG, WEBP, GIF).',
      });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatarUrl },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Profile photo uploaded successfully',
      user,
      avatarUrl,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update theme preference (preset or custom, font scale)
// @route   PUT /api/auth/theme
// @access  Private
const updateTheme = async (req, res, next) => {
  try {
    const { preset, mode, fontScale, customColors } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (preset) user.themePreference.preset = preset;
    if (mode) user.themePreference.mode = mode;
    if (fontScale) user.themePreference.fontScale = fontScale;
    if (customColors) {
      user.themePreference.customColors = {
        ...user.themePreference.customColors,
        ...customColors,
      };
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Theme preference saved',
      themePreference: user.themePreference,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Complete onboarding
// @route   PUT /api/auth/onboarding
// @access  Private
const completeOnboarding = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { hasCompletedOnboarding: true },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Onboarding completed',
      user,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      // Respond with success to prevent user enumeration
      return res.status(200).json({
        success: true,
        message: 'If that email address exists in our system, a password reset link has been dispatched.',
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 minutes

    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password/${resetToken}`;

    const message = `You are receiving this email because a password reset request was initiated for your Campus Coin account.\n\nPlease navigate to the following link to choose a new password:\n\n${resetUrl}\n\nThis link is valid for 30 minutes. If you did not request this, please disregard this message.`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #10b981;">Campus Coin Password Reset</h2>
        <p>Hello ${user.name},</p>
        <p>A request was received to reset the password for your Campus Coin account.</p>
        <div style="margin: 24px 0;">
          <a href="${resetUrl}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
        </div>
        <p style="color: #64748b; font-size: 13px;">Or copy and paste this link into your browser: <br/><a href="${resetUrl}">${resetUrl}</a></p>
        <p style="color: #94a3b8; font-size: 12px;">This link expires in 30 minutes. If you did not request this reset, no further action is required.</p>
      </div>
    `;

    const emailRes = await sendEmail({
      to: user.email,
      subject: 'Campus Coin — Password Reset Request',
      text: message,
      html,
    });

    res.status(200).json({
      success: true,
      message: 'Password reset link sent to email.',
      previewUrl: emailRes.previewUrl || null,
      devToken: process.env.NODE_ENV === 'development' ? resetToken : undefined,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:resetToken
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    const resetPasswordToken = crypto.createHash('sha256').update(req.params.resetToken).digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token',
      });
    }

    user.passwordHash = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You are now logged in.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  adminLogin,
  getMe,
  updateProfile,
  uploadStudentAvatar,
  updateTheme,
  completeOnboarding,
  forgotPassword,
  resetPassword,
};
