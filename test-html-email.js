require('dotenv').config();
const fetch = global.fetch || require('node-fetch');
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI, {serverSelectionTimeoutMS: 5000}).then(async () => {
  const students = await User.find({ role: 'student', isVerified: true, status: { $ne: 'passed' } }).limit(1);
  
  if (!students.length) {
    console.log('No pending students found');
    mongoose.disconnect();
    return;
  }
  
  const studentId = students[0]._id.toString();
  console.log('Testing email with student:', students[0].email);
  mongoose.disconnect();
  
  await new Promise(r => setTimeout(r, 800));
  
  const cookie = await fetch('http://127.0.0.1:3000/auth/login', {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: 'email='+encodeURIComponent('admin@admin.com')+'&password='+encodeURIComponent('admin123'),
    redirect: 'manual'
  }).then(r => r.headers.get('set-cookie'));
  
  console.log('Got auth cookie');
  
  const resp = await fetch('http://127.0.0.1:3000/admin/students/bulk-status', {
    method: 'POST',
    headers: {'content-type': 'application/json', 'cookie': cookie},
    body: JSON.stringify({studentIds: [studentId], status: 'passed'})
  });
  
  console.log('Response status:', resp.status);
  console.log('Email should be sent now - check Gmail');
}).catch(e => console.error('Error:', e.message));
