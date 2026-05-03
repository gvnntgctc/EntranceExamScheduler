require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function testQuery() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/examScheduler');
    console.log('Connected to database');

    const students = await User.find({ role: 'student', isVerified: true }).sort({ createdAt: -1 });
    console.log(`\nVerified students query returned ${students.length} results:`);
    console.log('='.repeat(60));

    students.forEach((student, index) => {
      console.log(`${index + 1}. ${student.fullName} (${student.email})`);
      console.log(`   Status: ${student.status}, Verified: ${student.isVerified}, Role: ${student.role}`);
      console.log(`   Created: ${student.createdAt}`);
      console.log('-'.repeat(40));
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testQuery();