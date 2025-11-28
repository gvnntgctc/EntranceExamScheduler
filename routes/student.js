const express = require('express');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const router = express.Router();

// Middleware to check if student
function isStudent(req, res, next) {
  if (req.session.userId && req.session.role === 'student') {
    return next();
  }
  res.redirect('/auth/login');
}

// Student Dashboard
router.get('/', isStudent, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const schedule = await Schedule.findOne({ studentId: req.session.userId });
    res.render('student-dashboard', { user, schedule });
  } catch (err) {
    console.error(err);
    res.redirect('/auth/login');
  }
});

module.exports = router;