const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  console.warn('nodemailer not installed; email sending is disabled.');
}

const User = require('../models/User');
const Schedule = require('../models/Schedule');
const Notification = require('../models/Notification');

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildNotificationAction(notification) {
  const recipientName = notification.recipientId?.fullName || notification.recipientEmail || 'recipient';
  const subject = (notification.subject || '').toLowerCase();
  const failed = notification.status === 'failed';
  const suffix = failed ? ' (failed)' : '';

  if (subject.includes('schedule')) {
    return `Scheduled exam for ${recipientName}${suffix}`;
  }
  if (subject.includes('admission') || subject.includes('decision') || subject.includes('notice')) {
    return `Sent admission status update to ${recipientName}${suffix}`;
  }
  if (subject.includes('exam result')) {
    return `Updated application status for ${recipientName}${suffix}`;
  }
  if (subject.includes('reset') && subject.includes('otp')) {
    return `Sent password reset instructions to ${recipientName}${suffix}`;
  }
  return `Sent notification to ${recipientName}${suffix}`;
}

let transporter = null;
if (nodemailer && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  const service = (process.env.EMAIL_SERVICE || 'outlook').toLowerCase();
  const transportConfig = { auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } };
  if (service === 'outlook') {
    transportConfig.host = 'smtp.office365.com';
    transportConfig.port = 587;
    transportConfig.secure = false;
  } else if (service === 'gmail') {
    transportConfig.host = 'smtp.gmail.com';
    transportConfig.port = 587;
    transportConfig.secure = false;
  } else {
    transportConfig.service = service;
  }

  transporter = nodemailer.createTransport(transportConfig);
  transporter.verify().then(() => {
    console.log(`${service} transporter verified for:`, process.env.EMAIL_USER);
  }).catch(err => {
    console.error('Transporter verify failed:', err);
  });
  console.log('Email transporter initialized for:', process.env.EMAIL_USER, 'service:', service);
} else {
  console.log('Email transporter NOT initialized. nodemailer:', !!nodemailer, 'EMAIL_USER:', !!process.env.EMAIL_USER, 'EMAIL_PASS:', !!process.env.EMAIL_PASS);
}

async function sendEmail({ recipientId, to, subject, text }) {
  if (!nodemailer) {
    console.warn('sendEmail skipped: nodemailer not available');
    await Notification.create({ recipientId, recipientEmail: to, subject, body: text, status: 'failed', errorMessage: 'nodemailer not available' });
    return false;
  }

  if (!transporter) {
    console.warn('sendEmail skipped: transporter not configured with Gmail credentials');
    await Notification.create({ recipientId, recipientEmail: to, subject, body: text, status: 'failed', errorMessage: 'transporter not configured' });
    return false;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text
    });

    await Notification.create({ recipientId, recipientEmail: to, subject, body: text, status: 'sent' });
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    await Notification.create({ recipientId, recipientEmail: to, subject, body: text, status: 'failed', errorMessage: error.message || String(error) });
    return false;
  }
}

// Middleware: Admin check
function isAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  res.redirect('/auth/login');
}

// Admin Dashboard redirects to Weekly Schedule page
router.get('/', isAdmin, (req, res) => {
  return res.redirect('/admin/weekly-schedule');
});

// Monthly Schedule Grid Page (12 months view)
router.get('/weekly-schedule', isAdmin, async (req, res) => {
  try {
    const schedules = await Schedule.find().populate('studentId');
    const currentYear = new Date().getFullYear();

    // Count schedules for each month
    const monthCounts = {};
    for (let i = 1; i <= 12; i++) {
      monthCounts[i] = 0;
    }
    
    schedules.forEach(schedule => {
      const d = new Date(schedule.examDate);
      if (d.getFullYear() === currentYear) {
        const month = d.getMonth() + 1;
        monthCounts[month]++;
      }
    });

    res.render('weekly-schedule', { 
      monthCounts, 
      currentYear, 
      page: 'weekly', 
      error: req.query.error || '', 
      success: req.query.success || '' 
    });

  } catch (error) {
    console.error(error);
    res.render('weekly-schedule', {
      monthCounts: {},
      currentYear: new Date().getFullYear(),
      page: 'weekly',
      error: 'Failed to load schedules',
      success: ''
    });
  }
});

// Month Detail Calendar Page
router.get('/month/:month', isAdmin, async (req, res) => {
  try {
    const month = parseInt(req.params.month);
    
    if (month < 1 || month > 12) {
      return res.redirect('/admin/weekly-schedule?error=Invalid month');
    }

    const year = new Date().getFullYear();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month - 1];

    // Get all schedules for this month
    const schedules = await Schedule.find().populate('studentId');
    const schedulesList = [];
    const schedulesMap = {};

    schedules.forEach(schedule => {
      const d = new Date(schedule.examDate);
      if (d.getMonth() === month - 1 && d.getFullYear() === year) {
        const dateStr = d.toISOString().split('T')[0];
        const studentName = schedule.studentId ? schedule.studentId.fullName : 'Unknown Applicant';

        if (!schedulesMap[dateStr]) {
          schedulesMap[dateStr] = [];
        }
        
        schedulesMap[dateStr].push({
          fullName: studentName,
          examTime: schedule.examTime
        });

        schedulesList.push({
          examDate: schedule.examDate,
          fullName: studentName,
          examTime: schedule.examTime
        });
      }
    });

    // Sort detailed list by date
    schedulesList.sort((a, b) => new Date(a.examDate) - new Date(b.examDate));

    res.render('month-detail', { 
      month,
      year,
      monthName,
      schedulesMap,
      schedulesList,
      totalSchedules: schedulesList.length,
      page: 'weekly',
      error: req.query.error || '', 
      success: req.query.success || '' 
    });

  } catch (error) {
    console.error(error);
    res.redirect('/admin/weekly-schedule?error=Failed to load month view');
  }
});

// Add Schedule Page
router.get('/add-schedule', isAdmin, async (req, res) => {
  try {
    const schedules = await Schedule.find().populate('studentId');
    const allStudents = await User.find({ role: 'student' }).sort({ fullName: 1 });
    
    // Get IDs of students who already have a schedule
    const scheduledStudentIds = new Set(schedules.map(s => s.studentId._id.toString()));
    
    // Filter out students who already have a schedule
    const students = allStudents.filter(student => !scheduledStudentIds.has(student._id.toString()));
    
    const minDate = new Date().toISOString().split('T')[0];

    res.render('add-schedule', { 
      schedules,
      students,
      minDate,
      page: 'addSchedule',
      error: req.query.error || '',
      success: req.query.success || ''
    });

  } catch (error) {
    console.error(error);
    const students = [];
    const minDate = new Date().toISOString().split('T')[0];
    res.render('add-schedule', { 
      schedules: [], 
      students,
      minDate,
      page: 'addSchedule',
      error: 'Failed to load schedules',
      success: ''
    });
  }
});

// Create Schedule
router.post('/add-schedule', isAdmin, async (req, res) => {
  try {
    const { studentId, examDate, examTime, location } = req.body;

    // Basic validation
    if (!studentId || !examDate || !examTime || !location) {
      return res.redirect('/admin/add-schedule?error=All fields are required');
    }

    // Try to find student by id first, otherwise allow using email or full name text
    let student = null;
    try {
      student = await User.findById(studentId);
    } catch (e) {
      student = null;
    }
    if (!student) {
      student = await User.findOne({ email: studentId }) || await User.findOne({ fullName: studentId });
    }
    if (!student) {
      return res.redirect('/admin/add-schedule?error=Student not found');
    }

    // Prevent duplicate schedules for the same student on the same day
    const dateStart = new Date(examDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateStart);
    dateEnd.setHours(23, 59, 59, 999);
    const existing = await Schedule.findOne({ studentId: student._id, examDate: { $gte: dateStart, $lte: dateEnd } });
    if (existing) {
      return res.redirect('/admin/add-schedule?error=This student already has a scheduled exam on that day');
    }

    const newSchedule = new Schedule({
      studentId: student._id,
      examDate: new Date(examDate),
      examTime: examTime.trim(),
      location: location.trim()
    });

    await newSchedule.save();

    // Notify applicant with schedule details
    const scheduleEmail = `Hello ${student.fullName || student.email},\n\nYour exam schedule has been set:\nDate: ${examDate}\nTime: ${examTime}\nLocation: ${location}\n\nPlease be ready and arrive 15 minutes early.\n\nGood luck!`;
    const notificationSent = await sendEmail({
      recipientId: student._id,
      to: student.email,
      subject: 'Your exam schedule is confirmed',
      text: scheduleEmail
    });

    if (notificationSent) {
      return res.redirect('/admin/add-schedule?success=Schedule created successfully and applicant notified');
    }

    return res.redirect('/admin/add-schedule?success=Schedule created successfully; applicant notification failed');
  } catch (error) {
    console.error('Failed to create schedule:', error);
    return res.redirect('/admin/add-schedule?error=Failed to create schedule');
  }
});

// Student detail API route
router.get('/students/api/:id', isAdmin, async (req, res) => {
  try {
    const studentId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }

    const student = await User.findById(studentId).lean();
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const studentSchedules = await Schedule.find({ studentId }).sort({ examDate: -1 }).lean();
    return res.json({ student, studentSchedules });
  } catch (error) {
    console.error('Error in /students/api/:id route:', error);
    return res.status(500).json({ error: 'Failed to load student details' });
  }
});

// Student detail view route
router.get('/students/view/:id', isAdmin, async (req, res) => {
  console.log('=== STUDENTS VIEW ROUTE HIT ===');
  console.log('Params ID:', req.params.id);
  console.log('Session role:', req.session.role);
  
  try {
    const studentId = req.params.id;
    console.log('Looking for student ID:', studentId);
    
    // Check if it's a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      console.log('Invalid ObjectId');
      return res.status(400).send('Invalid student ID');
    }
    
    const selectedStudent = await User.findById(studentId);
    console.log('Student found:', selectedStudent ? 'YES' : 'NO');
    
    if (!selectedStudent) {
      console.log('Student not found in database');
      return res.status(404).send('Student not found');
    }
    
    console.log('Student data:', { id: selectedStudent._id, name: selectedStudent.fullName, email: selectedStudent.email });
    
    // Continue with normal rendering...
    const search = req.query.search || '';
    const status = req.query.status || 'all';

    // Build query for filtering student list
    let query = { role: 'student', isVerified: true };
    if (status !== 'all') {
      query.status = status;
    }
    if (search) {
      const searchRegex = new RegExp(escapeRegExp(search), 'i');
      query.$or = [
        { fullName: searchRegex },
        { email: searchRegex }
      ];
    }

    const students = await User.find(query).sort({ createdAt: -1 });
    let studentSchedules = [];

    if (selectedStudent) {
      studentSchedules = await Schedule.find({ studentId }).sort({ examDate: -1 });
    }

    console.log('Rendering page with selectedStudent');
    
    res.render('admin-students', {
      students,
      studentSchedules,
      selectedStudent,
      selectedStudentId: studentId,
      search,
      status,
      page: 'students',
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    console.error('Error in /students/view/:id route:', error);
    res.status(500).send('Internal server error: ' + error.message);
  }
});

// Students List Page
router.get('/students', isAdmin, async (req, res) => {
  try {
    console.log('=== STUDENTS PAGE ===');
    console.log('Query params:', req.query);
    
    // Build query for filtering
    let query = { role: 'student', isVerified: true };
    
    console.log('Final query:', JSON.stringify(query, null, 2));
    
    let students = [];
    try {
      students = await User.find(query).sort({ createdAt: -1 });
      console.log('Found students:', students.length);
    } catch (findError) {
      console.error('Error finding students:', findError);
      throw findError;
    }
    
    let studentSchedules = [];
    let selectedStudent = null;
    let selectedStudentId = null;
    
    if (req.query.studentId) {
      selectedStudentId = req.query.studentId;
      console.log('Looking for student ID:', selectedStudentId);
      
      // Check if it's a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(selectedStudentId)) {
        console.log('Invalid ObjectId:', selectedStudentId);
        selectedStudent = null;
      } else {
        try {
          selectedStudent = await User.findById(selectedStudentId);
          console.log('Found selectedStudent:', selectedStudent ? `${selectedStudent.fullName} (${selectedStudent.email})` : 'NULL');
        } catch (err) {
          console.log('Error finding student by ID:', err.message);
        }
      }
      
      if (selectedStudent) {
        studentSchedules = await Schedule.find({ studentId: selectedStudentId }).sort({ examDate: -1 });
        console.log('Found schedules:', studentSchedules.length);
      }
    }

    console.log('Rendering with selectedStudent:', selectedStudent ? 'YES' : 'NO');
    
    res.render('admin-students', { 
      students,
      studentSchedules,
      selectedStudent,
      selectedStudentId,
      search: req.query.search || '',
      status: req.query.status || 'all',
      page: 'students',
      error: req.query.error || '',
      success: req.query.success || ''
    });

  } catch (error) {
    console.error('Error in /students route:', error);
    res.render('admin-students', { 
      students: [],
      studentSchedules: [],
      selectedStudent: null,
      selectedStudentId: null,
      page: 'students',
      error: `Failed to load students: ${error.message}`,
      success: ''
    });
  }
});

// Admin activity log page
router.get('/notifications', isAdmin, async (req, res) => {
  try {
    const query = {};

    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }

    const searchText = (req.query.search || '').trim();
    if (searchText) {
      const safeSearch = escapeRegExp(searchText);
      const searchRegex = new RegExp(safeSearch, 'i');

      query.$or = [
        { recipientEmail: searchRegex },
        { subject: searchRegex }
      ];

      const matchedUsers = await User.find({ fullName: searchRegex }, '_id');
      if (matchedUsers.length > 0) {
        query.$or.push({ recipientId: { $in: matchedUsers.map(user => user._id) } });
      }
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .populate('recipientId');

    const notificationsWithActions = notifications.map(notification => {
      notification.actionDescription = buildNotificationAction(notification);
      return notification;
    });

    res.render('admin-notifications', {
      notifications: notificationsWithActions,
      search: req.query.search || '',
      status: req.query.status || 'all',
      page: 'notifications',
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (err) {
    console.error('Failed to load notifications:', err);
    res.render('admin-notifications', {
      notifications: [],
      search: req.query.search || '',
      status: req.query.status || 'all',
      page: 'notifications',
      error: 'Failed to load activity log',
      success: ''
    });
  }
});

// Notification detail page
router.get('/notifications/:id', isAdmin, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id).populate('recipientId');
    if (!notification) {
      return res.redirect('/admin/notifications?error=Notification not found');
    }

    notification.actionDescription = buildNotificationAction(notification);

    res.render('admin-notification-detail', {
      notification,
      page: 'notifications',
      error: '',
      success: ''
    });
  } catch (err) {
    console.error('Failed to load notification detail:', err);
    res.redirect('/admin/notifications?error=Failed to load notification detail');
  }
});

// Clear all notifications
router.post('/notifications/clear', isAdmin, async (req, res) => {
  try {
    await Notification.deleteMany({});
    return res.redirect('/admin/notifications?success=All activity log entries cleared');
  } catch (error) {
    console.error('Failed to clear notifications:', error);
    return res.redirect('/admin/notifications?error=Failed to clear activity log');
  }
});

// Delete a single notification
router.post('/notifications/delete/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndDelete(id);
    return res.redirect('/admin/notifications?success=Notification deleted successfully');
  } catch (error) {
    console.error('Failed to delete notification:', error);
    return res.redirect('/admin/notifications?error=Failed to delete notification');
  }
});

// Delete student and their schedules
router.post('/students/delete/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const student = await User.findById(id);
    if (!student) return res.redirect('/admin/students?error=Student not found');

    if (student.role !== 'student') return res.redirect('/admin/students?error=Cannot delete this user');

    await Schedule.deleteMany({ studentId: student._id });
    await User.findByIdAndDelete(student._id);

    return res.redirect('/admin/students?success=Student and schedules deleted');
  } catch (err) {
    console.error('Failed to delete student:', err);
    return res.redirect('/admin/students?error=Failed to delete student');
  }
});

// Update student status (pass/fail)
router.post('/students/status/:id', isAdmin, async (req, res) => {
  try {
    const studentId = req.params.id;
    const { status } = req.body;

    if (!['passed', 'failed', 'pending'].includes(status)) {
      return res.redirect('/admin/students?error=Invalid status value');
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.redirect('/admin/students?error=Student not found');
    }

    student.status = status;
    student.notificationSent = false;

    let statusMessage = '';
    let emailSubject = '';
    let emailBody = '';

    if (status === 'passed') {
      statusMessage = 'Your application is approved. Check your exam schedule.';
      emailSubject = 'Admission Decision: Bachelor of Science in Information Technology (BSIT)';
      emailBody = `Dear Applicant,\n\nWe are pleased to inform you that you have successfully passed the entrance examination for the Bachelor of Science in Information Technology (BSIT) program.\n\nYour performance on the assessment demonstrated the technical aptitude and academic potential we look for in our incoming IT cohort. We are excited to welcome you to our academic community as you begin your journey toward a career in technology.`;
    } else if (status === 'failed') {
      statusMessage = 'Your application is not approved. Please try again next session.';
      emailSubject = 'Admission Notice: Application Not Approved';
      emailBody = `Dear Applicant,\n\nWe regret to inform you that you did not pass the entrance examination at this time. Please review your application and consider applying again in the next session.\n\nThank you for your interest and effort.`;
    } else {
      statusMessage = 'Application is pending review.';
      emailSubject = 'Exam result: pending evaluation';
      emailBody = `Hello ${student.fullName},\n\n${statusMessage}\n\nBest regards.`;
    }

    student.resultMessage = statusMessage;

    await student.save();

    console.log('[ADMIN STATUS] Sending to:', student.email, 'status:', status, 'message:', student.resultMessage);

    const sent = await sendEmail({
      recipientId: student._id,
      to: student.email,
      subject: emailSubject,
      text: emailBody
    });

    if (sent) {
      student.notificationSent = true;
      await student.save();
    }

    return res.redirect(`/admin/students/view/${studentId}?success=Status updated successfully`);
  } catch (error) {
    console.error('Failed to update status:', error);
    return res.redirect('/admin/students?error=Failed to update status');
  }
});


// Detailed Schedule for a specific day
router.get('/schedules/day/:day', isAdmin, async (req, res) => {
  const { day } = req.params;
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  try {
    const schedules = await Schedule.find().populate('studentId');
    
    const filteredSchedules = schedules.filter(s => {
      const d = new Date(s.examDate);
      const weekday = d.toLocaleString('default', { weekday: 'long' });
      return weekday === day && d.getMonth() === month && d.getFullYear() === year;
    });

    res.render('day-schedule-detail', {
      schedules: filteredSchedules,
      day,
      monthName: month.toLocaleString
        ? month.toLocaleString('default', { month: 'long' }) 
        : now.toLocaleString('default', { month: 'long' }), // fallback
      year,
      page: 'daily',
      error: '',
      success: ''
    });
  } catch (error) {
    console.error(error);
    res.redirect('/admin/weekly-schedule?error=Failed to load day schedule');
  }
});

// Get Edit Schedule Page
router.get('/edit-schedule/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await Schedule.findById(id).populate('studentId');
    
    if (!schedule) {
      return res.redirect('/admin/add-schedule?error=Schedule not found');
    }

    res.render('edit-schedule', { 
      schedule,
      page: 'editSchedule',
      error: req.query.error || '',
      success: req.query.success || ''
    });

  } catch (error) {
    console.error('Failed to load edit schedule page:', error);
    return res.redirect('/admin/add-schedule?error=Failed to load schedule');
  }
});

// Update Schedule
router.post('/edit-schedule/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { examDate, examTime, location } = req.body;

    // Basic validation
    if (!examDate || !examTime || !location) {
      return res.redirect(`/admin/edit-schedule/${id}?error=All fields are required`);
    }

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.redirect('/admin/add-schedule?error=Schedule not found');
    }

    // Update the schedule
    schedule.examDate = new Date(examDate);
    schedule.examTime = examTime.trim();
    schedule.location = location.trim();

    await schedule.save();

    return res.redirect('/admin/add-schedule?success=Schedule updated successfully');
  } catch (error) {
    console.error('Failed to update schedule:', error);
    return res.redirect('/admin/add-schedule?error=Failed to update schedule');
  }
});

// Delete Schedule
router.post('/delete-schedule/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await Schedule.findById(id);
    
    if (!schedule) {
      return res.redirect('/admin/add-schedule?error=Schedule not found');
    }

    await Schedule.findByIdAndDelete(id);
    return res.redirect('/admin/add-schedule?success=Schedule deleted successfully');
  } catch (error) {
    console.error('Failed to delete schedule:', error);
    return res.redirect('/admin/add-schedule?error=Failed to delete schedule');
  }
});

module.exports = router;