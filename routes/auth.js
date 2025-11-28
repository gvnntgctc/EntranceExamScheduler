const express = require('express');
const User = require('../models/User');
const router = express.Router();

// Auth Page (GET)
router.get('/login', (req, res) => {
  const error = req.query.error || '';
  const success = req.query.success || '';
  const formType = req.query.register === 'true' ? 'register' : 'login';
  res.render('auth', { error, success, formType });
});

// Redirect /register to /login?register=true
router.get('/register', (req, res) => {
  res.redirect('/auth/login?register=true');
});

// Login (POST)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ 
      email: email.toLowerCase() 
    });
    
    if (!user || user.password !== password) {
      return res.redirect('/auth/login?error=Invalid email or password.');
    }
    
    req.session.userId = user._id;
    req.session.role = user.role;
    
    if (user.role === 'admin') {
      return res.redirect('/admin');
    }
    return res.redirect('/student');
  } catch (err) {
    console.error(err);
    res.redirect('/auth/login?error=Login failed. Please try again.');
  }
});

// Register (POST)
router.post('/register', async (req, res) => {
  try {
    const { email, fullName, password, confirmPassword } = req.body;
    
    // Validation
    if (!email || !fullName || !password || !confirmPassword) {
      return res.redirect('/auth/login?register=true&error=All fields are required.');
    }
    
    if (password.length < 6) {
      return res.redirect('/auth/login?register=true&error=Password must be at least 6 characters.');
    }
    
    if (password !== confirmPassword) {
      return res.redirect('/auth/login?register=true&error=Passwords do not match.');
    }
    
    // Check if email already exists
    const existingUser = await User.findOne({ 
      email: email.toLowerCase() 
    });
    
    if (existingUser) {
      return res.redirect('/auth/login?register=true&error=Email already registered.');
    }
    
    // Create new user
    const newUser = new User({
      email: email.toLowerCase(),
      fullName,
      password,
      role: 'student'
    });
    
    await newUser.save();
    res.redirect('/auth/login?success=Account created! Please login.');
  } catch (err) {
    console.error(err);
    res.redirect('/auth/login?register=true&error=Registration failed. Please try again.');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/auth/login');
});

module.exports = router;