require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/examScheduler');
    console.log('Connected to database');

    const users = await User.find({}).select('fullName email phoneNumber isVerified status role');
    console.log(`\nFound ${users.length} users in database:`);
    console.log('='.repeat(80));

    users.forEach((user, index) => {
      console.log(`${index + 1}. ID: ${user._id}`);
      console.log(`   Name: ${user.fullName}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Phone: ${user.phoneNumber}`);
      console.log(`   Verified: ${user.isVerified}`);
      console.log(`   Status: ${user.status}`);
      console.log(`   Role: ${user.role}`);
      console.log('-'.repeat(40));
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkUsers();