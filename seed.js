const mongoose = require('mongoose');
const User = require('./models/User');
const Schedule = require('./models/Schedule'); // This is missing!


mongoose.connect('mongodb://localhost:27017/examScheduler');

async function seed() {
  // Clear existing users (optional: comment this out if you want to keep data)
  await User.deleteMany({});

  // Insert new users
  await User.create([
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'student1', password: 'pass123', role: 'student' },
    { username: 'student2', password: 'pass123', role: 'student' },
  ]);
  console.log('Sample users seeded successfully');
  mongoose.disconnect();
}

seed().catch(console.error);