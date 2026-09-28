const CorrectionLog = require('../models/CorrectionLog');

// Default heuristic keyword dictionary
const KEYWORD_RULES = {
  expense: {
    Food: [
      'cafe', 'coffee', 'starbucks', 'dining', 'pizza', 'burger', 'canteen', 'mess',
      'grocery', 'groceries', 'supermarket', 'subway', 'mcdonald', 'chipotle', 'taco',
      'dominos', 'kfc', 'restaurant', 'lunch', 'dinner', 'breakfast', 'snack', 'food',
      'doordash', 'ubereats', 'grubhub', 'boba', 'bakery', 'tea', 'ramen', 'shawarma'
    ],
    Transport: [
      'uber', 'lyft', 'bus', 'metro', 'train', 'transit', 'subway', 'cab', 'taxi',
      'gas', 'fuel', 'petrol', 'parking', 'bike', 'scooter', 'flight', 'railway',
      'trainline', 'carpool', 'toll'
    ],
    'Hostel/Rent': [
      'rent', 'dorm', 'hostel', 'room', 'landlord', 'apartment', 'housing',
      'electricity', 'power', 'water bill', 'utilities', 'wifi bill', 'broadband', 'lease'
    ],
    Academics: [
      'tuition', 'book', 'textbook', 'course', 'exam', 'fee', 'lab', 'coursera',
      'udemy', 'edx', 'stationery', 'notebook', 'pencil', 'pen', 'printer', 'printout',
      'xerox', 'canvas', 'chegg', 'library', 'calculator', 'software license'
    ],
    Subscriptions: [
      'netflix', 'spotify', 'youtube', 'apple music', 'prime', 'amazon prime',
      'disney', 'hulu', 'hbo', 'chatgpt', 'openai', 'github', 'adobe', 'gym',
      'icloud', 'google one', 'patreon', 'audible', 'notion'
    ],
    Entertainment: [
      'movie', 'cinema', 'theatre', 'theater', 'concert', 'festival', 'club', 'bar',
      'bowling', 'party', 'steam', 'game', 'playstation', 'xbox', 'nintendo', 'arcade',
      'amusement', 'billiards', 'board game'
    ],
    Miscellaneous: [
      'clothes', 'clothing', 'shoes', 'haircut', 'salon', 'barber', 'shampoo',
      'medicine', 'pharmacy', 'doctor', 'clinic', 'dentist', 'gift', 'donation',
      'laundry', 'dry clean', 'repair', 'hardware', 'amazon', 'walmart', 'target'
    ],
  },
  income: {
    Allowance: ['allowance', 'pocket money', 'parents', 'mom', 'dad', 'family'],
    'Part-time Job': ['salary', 'wages', 'paycheck', 'work', 'shift', 'hourly', 'job', 'tutoring', 'freelance'],
    Scholarship: ['scholarship', 'grant', 'stipend', 'bursary', 'fellowship', 'financial aid'],
    Gift: ['gift', 'birthday', 'cash gift', 'prize', 'reward', 'present'],
    'Other Income': ['refund', 'cashback', 'reimbursement', 'sold item', 'interest', 'dividend'],
  },
};

/**
 * Categorize a transaction description using user corrections, keyword rules, or AI
 * @param {string} description
 * @param {string} type - 'income' or 'expense'
 * @param {string} userId
 * @returns {Promise<{ categoryName: string, confidence: number, source: string }>}
 */
const categorizeDescription = async (description, type = 'expense', userId = null) => {
  if (!description || typeof description !== 'string') {
    return {
      categoryName: type === 'income' ? 'Other Income' : 'Miscellaneous',
      confidence: 0.1,
      source: 'fallback',
    };
  }

  const cleanDesc = description.trim().toLowerCase();

  // 1. Check user historical corrections
  if (userId) {
    try {
      const pastCorrection = await CorrectionLog.findOne({
        userId,
        description: cleanDesc,
      }).sort({ createdAt: -1 });

      if (pastCorrection) {
        return {
          categoryName: pastCorrection.correctedCategory,
          confidence: 0.95,
          source: 'user_learned',
        };
      }
    } catch (e) {
      console.warn('[AI Categorizer] Failed to read correction log:', e.message);
    }
  }

  // 2. Keyword heuristic matching
  const rules = KEYWORD_RULES[type] || KEYWORD_RULES.expense;
  for (const [category, keywords] of Object.entries(rules)) {
    for (const kw of keywords) {
      if (cleanDesc.includes(kw)) {
        return {
          categoryName: category,
          confidence: 0.85,
          source: 'keyword_heuristic',
        };
      }
    }
  }

  // 3. Fallback default
  return {
    categoryName: type === 'income' ? 'Other Income' : 'Miscellaneous',
    confidence: 0.3,
    source: 'rule_default',
  };
};

/**
 * Log a user correction when they change an AI suggested category
 */
const logCorrection = async (userId, description, suggestedCategory, correctedCategory) => {
  if (!userId || !description || !correctedCategory) return;
  if (suggestedCategory && suggestedCategory === correctedCategory) return;

  try {
    await CorrectionLog.create({
      userId,
      description: description.trim().toLowerCase(),
      suggestedCategory: suggestedCategory || '',
      correctedCategory,
    });
  } catch (error) {
    console.warn('[AI Categorizer] Error saving correction log:', error.message);
  }
};

module.exports = {
  categorizeDescription,
  logCorrection,
  KEYWORD_RULES,
};
