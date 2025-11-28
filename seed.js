const mongoose = require('mongoose');
const User = require('./models/User');

// Connect without deprecated options
mongoose.connect('mongodb://localhost:27017/exam-scheduler');

async function createAdmin() {
  try {
    console.log('Connecting to database...');
    
    // Wait for connection
    await mongoose.connection.asPromise();
    console.log('Connected to MongoDB!');
    
    // Delete old admin accounts
    await User.deleteMany({ role: 'admin' });
    console.log('Old admin accounts deleted.');
    
    // Create new admin
    const admin = new User({
      email: 'admin@admin.com',
      fullName: 'Administrator',
      password: 'admin123',
      role: 'admin'
    });
    
    await admin.save();
    
    console.log('========================================');
    console.log('Admin account created successfully!');
    console.log('========================================');
    console.log('Email: admin@admin.com');
    console.log('Password: admin123');
    console.log('========================================');
    
    mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    mongoose.connection.close();
    process.exit(1);
  }
}

createAdmin();