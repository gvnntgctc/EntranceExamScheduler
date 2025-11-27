const express = require('express');
const User = require('../models/User');
const router = express.Router();

// Auth Page - renders "auth.ejs" NOT "login.ejs"
router.get('/login', (req, res) => {
  const error = req.query.error || '';
  const success = req.query.success || '';
  const formType = req.query.register === 'true' ? 'register' : 'login';
  res.render('auth', { error, success, formType });  // Changed from 'login' to 'auth'
});

router.get('/register', (req, res) => {
  res.redirect('/auth/login?register=true');
});

// Login POST
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ 
      username: new RegExp(`^${username}$`, 'i') 
    });
    
    if (!user || user.password !== password) {
      return res.redirect('/auth/login?error=Invalid username or password.');
    }
    
    req.session.userId = user._id;
    req.session.role = user.role;
    
    if (user.role === 'admin') {
      return res.redirect('/admin');
    }
    return res.redirect('/student');
  } catch (err) {
    console.error(err);
    res.redirect('/auth/login?error=Login failed.');
  }
});

// Register POST
router.post('/register', async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;
    
    if (!username || !password || !confirmPassword) {
      return res.redirect('/auth/login?register=true&error=All fields are required.');
    }
    
    if (password.length < 6) {
      return res.redirect('/auth/login?register=true&error=Password must be at least 6 characters.');
    }
    
    if (password !== confirmPassword) {
      return res.redirect('/auth/login?register=true&error=Passwords do not match.');
    }
    
    const existingUser = await User.findOne({ 
      username: new RegExp(`^${username}$`, 'i') 
    });
    
    if (existingUser) {
      return res.redirect('/auth/login?register=true&error=Username already taken.');
    }
    
    const newUser = new User({
      username: username.toLowerCase(),
      password: password,
      role: 'student'
    });
    
    await newUser.save();
    res.redirect('/auth/login?success=Account created! Please login.');
  } catch (err) {
    console.error(err);
    res.redirect('/auth/login?register=true&error=Registration failed.');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/auth/login');
});

module.exports = router;