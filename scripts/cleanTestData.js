const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function clean() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/campus_coin');
  console.log('Connected to MongoDB.');

  // Find all test users
  const testUsers = await mongoose.connection.db.collection('users').find({
    $or: [
      { email: { $regex: /^(teststudent_|student2_|disabled_|student_notif_|fresh_student_)/i } },
      { name: { $regex: /(test student|student two|disabled student|alex rivera updated|dynamic student)/i } }
    ]
  }).toArray();

  const testUserIds = testUsers.map(u => u._id);
  console.log(`Found ${testUsers.length} test users to remove.`);

  if (testUserIds.length > 0) {
    const delUsers = await mongoose.connection.db.collection('users').deleteMany({
      _id: { $in: testUserIds }
    });
    console.log(`Deleted ${delUsers.deletedCount} test user accounts.`);

    const delTx = await mongoose.connection.db.collection('transactions').deleteMany({
      userId: { $in: testUserIds }
    });
    console.log(`Deleted ${delTx.deletedCount} transactions associated with test users.`);

    const delNotifs = await mongoose.connection.db.collection('notifications').deleteMany({
      userId: { $in: testUserIds }
    });
    console.log(`Deleted ${delNotifs.deletedCount} notifications.`);

    const delInsights = await mongoose.connection.db.collection('insights').deleteMany({
      userId: { $in: testUserIds }
    });
    console.log(`Deleted ${delInsights.deletedCount} insights.`);

    const delTips = await mongoose.connection.db.collection('tips').deleteMany({
      userId: { $in: testUserIds }
    });
    console.log(`Deleted ${delTips.deletedCount} tips.`);

    const delBudgets = await mongoose.connection.db.collection('budgets').deleteMany({
      userId: { $in: testUserIds }
    });
    console.log(`Deleted ${delBudgets.deletedCount} budgets.`);

    const delCorrections = await mongoose.connection.db.collection('correctionlogs').deleteMany({
      userId: { $in: testUserIds }
    });
    console.log(`Deleted ${delCorrections.deletedCount} correction logs.`);
  }

  // Delete leftover test announcements
  const delAnn = await mongoose.connection.db.collection('announcements').deleteMany({
    title: { $regex: /(midterm break reminder|test)/i }
  });
  console.log(`Deleted ${delAnn.deletedCount} test announcements.`);

  // Verify remaining DB records
  const remUsers = await mongoose.connection.db.collection('users').find({}).toArray();
  const remTx = await mongoose.connection.db.collection('transactions').find({}).toArray();
  const remAnn = await mongoose.connection.db.collection('announcements').find({}).toArray();
  const remCats = await mongoose.connection.db.collection('categories').find({}).toArray();

  console.log('\n--- CLEAN DB STATE ---');
  console.log('Users in DB:', remUsers.map(u => ({ id: u._id, email: u.email, role: u.role, name: u.name })));
  console.log('Transactions in DB:', remTx.length);
  console.log('Announcements in DB:', remAnn.length);
  console.log('Default Categories in DB:', remCats.filter(c => c.isDefault).length);

  await mongoose.disconnect();
  console.log('Done.');
}

clean().catch(err => {
  console.error(err);
  process.exit(1);
});
