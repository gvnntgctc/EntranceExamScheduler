const express = require('express');
const Schedule = require('../models/Schedule');
const router = express.Router();

// Middleware to check if student
function isStudent(req, res, next) {
  if (req.session.role === 'student') return next();
  res.redirect('/auth/login');
}

// Student dashboard (GET)
router.get('/', isStudent, async (req, res) => {
  const schedule = await Schedule.findOne({ studentId: req.session.userId });
  res.render('student-dashboard', { schedule });
});

module.exports = router;