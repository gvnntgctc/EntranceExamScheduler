const express = require('express');
const Schedule = require('../models/Schedule');
const User = require('../models/User');
const router = express.Router();

// Middleware to check if admin
function isAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  res.redirect('/auth/login');
}

// Admin dashboard (GET)
router.get('/', isAdmin, async (req, res) => {
  try {
    const schedules = await Schedule.find().populate({
      path: 'studentId',
      match: { role: 'student' },
      select: 'username'
    });
    const validSchedules = schedules.filter(schedule => schedule.studentId !== null);
    const students = await User.find({ role: 'student' });
    const error = req.query.error || '';
    const success = req.query.success || '';
    res.render('admin-dashboard', { schedules: validSchedules, students, error, success });
  } catch (err) {
    console.error(err);
    res.send('Error loading dashboard');
  }
});

// Add schedule (POST)
router.post('/add-schedule', isAdmin, async (req, res) => {
  try {
    const { studentUsername, examDate, examHour, examMinute, examPeriod, location } = req.body;
    
    // Combine time parts into one string
    const examTime = `${examHour}:${examMinute} ${examPeriod}`;
    
    // Find the student by username (case-insensitive)
    const student = await User.findOne({ 
      username: new RegExp(`^${studentUsername}$`, 'i'), 
      role: 'student' 
    });
    
    if (!student) {
      return res.redirect('/admin?error=Student not found. Please check the username.');
    }
    
    // Check if the student already has a schedule
    const existingSchedule = await Schedule.findOne({ studentId: student._id });
    if (existingSchedule) {
      return res.redirect('/admin?error=This student already has a schedule.');
    }
    
    // Create the schedule
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

// Delete schedule (POST)
router.post('/delete-schedule', isAdmin, async (req, res) => {
  try {
    const { scheduleId } = req.body;
    
    if (!scheduleId) {
      return res.redirect('/admin?error=Invalid schedule ID.');
    }
    
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return res.redirect('/admin?error=Schedule not found.');
    }
    
    await Schedule.findByIdAndDelete(scheduleId);
    res.redirect('/admin?success=Schedule deleted successfully.');
  } catch (err) {
    console.error(err);
    res.redirect('/admin?error=Error deleting schedule.');
  }
});

// Edit schedule page (GET)
router.get('/edit-schedule/:id', isAdmin, async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id).populate('studentId', 'username');
    if (!schedule) {
      return res.redirect('/admin?error=Schedule not found.');
    }
    const error = req.query.error || '';
    res.render('edit-schedule', { schedule, error });
  } catch (err) {
    console.error(err);
    res.redirect('/admin?error=Error loading schedule.');
  }
});

// Update schedule (POST)
router.post('/edit-schedule/:id', isAdmin, async (req, res) => {
  try {
    const { studentUsername, examDate, examHour, examMinute, examPeriod, location } = req.body;
    
    // Combine time parts into one string
    const examTime = `${examHour}:${examMinute} ${examPeriod}`;
    
    // Find the student by username (case-insensitive)
    const student = await User.findOne({ 
      username: new RegExp(`^${studentUsername}$`, 'i'), 
      role: 'student' 
    });
    
    if (!student) {
      return res.redirect(`/admin/edit-schedule/${req.params.id}?error=Student not found.`);
    }
    
    // Update the schedule
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

module.exports = router;