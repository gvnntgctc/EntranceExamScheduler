const express = require('express');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const router = express.Router();

// Middleware to check if admin
function isAdmin(req, res, next) {
  if (req.session.role === 'admin') {
    return next();
  }
  res.redirect('/auth/login');
}

// Dashboard
router.get('/', isAdmin, async (req, res) => {
  try {
    const schedules = await Schedule.find().populate('studentId');
    res.render('admin-dashboard', { schedules, error: req.query.error, success: req.query.success });
  } catch (err) {
    console.error(err);
    res.render('admin-dashboard', { schedules: [], error: 'Error loading schedules', success: '' });
  }
});

// View Students
router.get('/students', isAdmin, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).sort({ createdAt: -1 });
    res.render('admin-students', { students, error: req.query.error, success: req.query.success });
  } catch (err) {
    console.error(err);
    res.render('admin-students', { students: [], error: 'Error loading students', success: '' });
  }
});

// Add Schedule
router.post('/add-schedule', isAdmin, async (req, res) => {
  try {
    const { studentEmail, examDate, examTime, location } = req.body;
    
    const student = await User.findOne({ 
      email: studentEmail.toLowerCase(), 
      role: 'student' 
    });
    
    if (!student) {
      return res.redirect('/admin?error=Student not found. Please check the email.');
    }
    
    const existingSchedule = await Schedule.findOne({ studentId: student._id });
    if (existingSchedule) {
      return res.redirect('/admin?error=This student already has a schedule.');
    }
    
    const schedule = new Schedule({ 
      studentId: student._id, 
      examDate, 
      examTime, 
      location 
    });
    await schedule.save();
    res.redirect('/admin?success=Schedule added successfully.');
  } catch (err) {
    console.error(err);
    res.redirect('/admin?error=Error adding schedule.');
  }
});

// Edit Schedule (GET)
router.get('/edit-schedule/:id', isAdmin, async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id).populate('studentId');
    if (!schedule) {
      return res.redirect('/admin?error=Schedule not found.');
    }
    res.render('edit-schedule', { schedule, error: req.query.error });
  } catch (err) {
    console.error(err);
    res.redirect('/admin?error=Error loading schedule.');
  }
});

// Edit Schedule (POST)
router.post('/edit-schedule/:id', isAdmin, async (req, res) => {
  try {
    const { studentEmail, examDate, examTime, location } = req.body;
    
    const student = await User.findOne({ 
      email: studentEmail.toLowerCase(), 
      role: 'student' 
    });
    
    if (!student) {
      return res.redirect(`/admin/edit-schedule/${req.params.id}?error=Student not found.`);
    }
    
    await Schedule.findByIdAndUpdate(req.params.id, {
      studentId: student._id,
      examDate,
      examTime,
      location
    });
    
    res.redirect('/admin?success=Schedule updated successfully.');
  } catch (err) {
    console.error(err);
    res.redirect('/admin?error=Error updating schedule.');
  }
});

// Delete Schedule
router.post('/delete-schedule', isAdmin, async (req, res) => {
  try {
    const { scheduleId } = req.body;
    await Schedule.findByIdAndDelete(scheduleId);
    res.redirect('/admin?success=Schedule deleted successfully.');
  } catch (err) {
    console.error(err);
    res.redirect('/admin?error=Error deleting schedule.');
  }
});

module.exports = router;
