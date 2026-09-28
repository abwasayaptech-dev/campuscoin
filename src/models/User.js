const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email address',
      ],
    },
    passwordHash: {
      type: String,
      required: [true, 'Please add a password'],
      select: false,
    },
    role: {
      type: String,
      enum: ['student', 'admin'],
      default: 'student',
    },
    academicYear: {
      type: String,
      enum: ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other'],
      default: 'Freshman',
    },
    monthlyAllowanceBaseline: {
      type: Number,
      default: 500,
      min: [0, 'Allowance cannot be negative'],
    },
    monthlySavingsGoal: {
      type: Number,
      default: 100,
      min: [0, 'Savings goal cannot be negative'],
    },
    themePreference: {
      preset: {
        type: String,
        default: 'fresh-mint',
      },
      mode: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light',
      },
      fontScale: {
        type: String,
        enum: ['small', 'medium', 'large'],
        default: 'medium',
      },
      customColors: {
        primary: { type: String, default: '#10b981' },
        secondary: { type: String, default: '#f59e0b' },
        bg: { type: String, default: '#f8fafc' },
        surface: { type: String, default: '#ffffff' },
        text: { type: String, default: '#0f172a' },
      },
    },
    greetingPreference: {
      style: {
        type: String,
        enum: ['time-based', 'whimsical', 'motivational', 'chill', 'formal', 'gamer', 'custom'],
        default: 'time-based',
      },
      customText: {
        type: String,
        default: '',
        maxlength: [100, 'Custom greeting cannot exceed 100 characters'],
      },
      customSubtext: {
        type: String,
        default: '',
        maxlength: [200, 'Custom subtitle cannot exceed 200 characters'],
      },
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    currency: {
      type: String,
      default: 'USD',
      trim: true,
      uppercase: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    hasCompletedOnboarding: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  {
    timestamps: true,
  }
);

// Encrypt password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

// Match password
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

// Sign JWT
UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role, email: this.email, name: this.name },
    process.env.JWT_SECRET || 'supersecret_campus_coin_jwt_key_2025_secure_dev!',
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

module.exports = mongoose.model('User', UserSchema);
