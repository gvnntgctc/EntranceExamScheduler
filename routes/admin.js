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
  const body = (notification.body || '').toLowerCase();
  const failed = notification.status === 'failed';
  const suffix = failed ? ' (failed)' : '';

  // Schedule actions
  if (subject.includes('schedule added') || body.includes('created exam schedule')) {
    return `✅ Schedule Created for ${recipientName}`;
  }
  if (subject.includes('schedule updated') || body.includes('updated exam schedule')) {
    return `📝 Schedule Updated for ${recipientName}`;
  }
  if (subject.includes('schedule deleted') || body.includes('deleted exam schedule')) {
    return `🗑️ Schedule Deleted for ${recipientName}`;
  }
  
  // Student deletion
  if (subject.includes('student account deleted') || body.includes('deleted student account')) {
    return `❌ Student Account Deleted: ${recipientName}`;
  }
  
  // Application status
  if (subject.includes('application status updated') || subject.includes('status updated')) {
    const statusMatch = body.match(/status to:\s*(passed|failed|pending|approved|not approved)/i);
    if (statusMatch) {
      const statusText = statusMatch[1].toUpperCase();
      return `📋 Application Status Updated to ${statusText} for ${recipientName}`;
    }
    return `📋 Application Status Updated for ${recipientName}${suffix}`;
  }
  
  // Admission decisions (emails)
  if (subject.includes('admission decision') || subject.includes('approved') || subject.includes('not approved')) {
    if (subject.includes('approved')) {
      return `📧 Admission Approval Email sent to ${recipientName}${suffix}`;
    }
    return `📧 Admission Decision Email sent to ${recipientName}${suffix}`;
  }
  
  // Exam schedule confirmation emails
  if (subject.includes('examination schedule confirmation') || subject.includes('exam schedule')) {
    return `📧 Schedule Confirmation Email sent to ${recipientName}${suffix}`;
  }
  
  // Registration/verification emails
  if (subject.includes('registration') || subject.includes('verification')) {
    return `📧 Registration Email sent to ${recipientName}${suffix}`;
  }
  
  // Generic email notification
  if (subject.includes('email') || notification.subject?.includes('sent')) {
    return `📧 Email sent to ${recipientName}${suffix}`;
  }
  
  return `📧 Notification sent to ${recipientName}${suffix}`;
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

    const today = new Date();
    const upcomingDates = schedules
      .filter(schedule => new Date(schedule.examDate) >= today)
      .sort((a, b) => new Date(a.examDate) - new Date(b.examDate))
      .reduce((acc, schedule) => {
        const dateObj = new Date(schedule.examDate);
        const dateKey = dateObj.toISOString().split('T')[0];
        const displayDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        const existing = acc.find(item => item.dateKey === dateKey);
        if (existing) {
          existing.count += 1;
        } else {
          acc.push({ dateKey, displayDate, count: 1 });
        }
        return acc;
      }, [])
      .slice(0, 6);

    res.render('weekly-schedule', { 
      monthCounts, 
      currentYear, 
      upcomingDates,
      page: 'weekly', 
      error: req.query.error || '', 
      success: req.query.success || '' 
    });

  } catch (error) {
    console.error(error);
    res.render('weekly-schedule', {
      monthCounts: {},
      currentYear: new Date().getFullYear(),
      upcomingDates: [],
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

    const scheduleCounts = schedules.reduce((acc, schedule) => {
      const dateKey = new Date(schedule.examDate).toISOString().split('T')[0];
      acc[dateKey] = (acc[dateKey] || 0) + 1;
      return acc;
    }, {});
    
    const minDate = '2026-03-01';
    const maxDate = '2026-08-31';

    res.render('add-schedule', { 
      schedules,
      students,
      scheduleCounts,
      minDate,
      maxDate,
      page: 'addSchedule',
      error: req.query.error || '',
      success: req.query.success || ''
    });

  } catch (error) {
    console.error(error);
    const students = [];
    const minDate = '2026-03-01';
    const maxDate = '2026-08-31';
    res.render('add-schedule', { 
      schedules: [], 
      students,
      scheduleCounts: {},
      minDate,
      maxDate,
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

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(examDate)) {
      return res.redirect('/admin/add-schedule?error=Invalid exam date');
    }

    const parsedExamDate = new Date(examDate);
    if (Number.isNaN(parsedExamDate.getTime()) || parsedExamDate.toISOString().slice(0, 10) !== examDate) {
      return res.redirect('/admin/add-schedule?error=Invalid exam date');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allowedStart = new Date(2026, 2, 1);
    const allowedEnd = new Date(2026, 7, 31);
    if (parsedExamDate < today || parsedExamDate < allowedStart || parsedExamDate > allowedEnd) {
      return res.redirect('/admin/add-schedule?error=Exam date must be between March 1, 2026 and August 31, 2026');
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
    const dateCount = await Schedule.countDocuments({ examDate: { $gte: dateStart, $lte: dateEnd } });
    if (dateCount >= 50) {
      return res.redirect('/admin/add-schedule?error=This exam date has reached the maximum limit of 50 scheduled applicants');
    }

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

    // Log schedule creation in activity log
    await Notification.create({
      recipientId: student._id,
      recipientEmail: student.email,
      subject: 'Schedule Added',
      body: `Admin created exam schedule: ${new Date(examDate).toLocaleDateString()} at ${examTime} in ${location}`,
      status: 'sent'
    });

    // Notify applicant with schedule details
    const scheduleEmail = `Dear ${student.fullName || student.email},\n\nRe: Official Exam Schedule - Bachelor of Science in Information Technology Program\n\nWe are writing to confirm your examination schedule for the BSIT entrance examination.\n\n═══════════════════════════════════════════════════════════════════════════════\nEXAMINATION DETAILS\n═══════════════════════════════════════════════════════════════════════════════\n\nExamination Date: ${new Date(examDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\nExamination Time: ${examTime}\nExamination Location: ${location}\n\n═══════════════════════════════════════════════════════════════════════════════\nIMPORTANT INSTRUCTIONS\n═══════════════════════════════════════════════════════════════════════════════\n\n✓ ARRIVAL TIME: Please arrive AT LEAST 15 MINUTES BEFORE your scheduled examination time.\n\n✓ REQUIRED DOCUMENTS: Bring a valid government-issued ID for verification purposes.\n\n✓ PROHIBITED ITEMS: Mobile phones, calculators (unless explicitly permitted), notes, and other unauthorized materials are strictly not allowed in the examination room.\n\n✓ DRESS CODE: Professional attire is recommended.\n\n✓ CONDUCT: Academic integrity is paramount. Any form of cheating or misconduct will result in automatic disqualification.\n\n═══════════════════════════════════════════════════════════════════════════════\nADDITIONAL INFORMATION\n═══════════════════════════════════════════════════════════════════════════════\n\n• The examination will test your knowledge in mathematics, computer science fundamentals, and logical reasoning.\n• Duration: Approximately 2-3 hours (specific duration will be announced at the examination venue)\n• Results will be communicated within 2-3 weeks following the examination date.\n\nIf you have any questions regarding your examination schedule or require any clarifications, please contact our Admissions Office immediately.\n\nBest wishes for your examination!\n\nRegards,\n\nAdmissions Office\nBachelor of Science in Information Technology Program\nEntranceExam Administration`;
    const notificationSent = await sendEmail({
      recipientId: student._id,
      to: student.email,
      subject: 'Official Examination Schedule Confirmation - BSIT Program',
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
  try {
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
    const studentId = req.params.id;
    let selectedStudent = null;
    let studentSchedules = [];

    if (mongoose.Types.ObjectId.isValid(studentId)) {
      selectedStudent = await User.findById(studentId);
      if (selectedStudent) {
        studentSchedules = await Schedule.find({ studentId }).sort({ examDate: -1 });
      }
    }

    res.render('admin-students', {
      students,
      studentSchedules,
      selectedStudent,
      selectedStudentId: studentId,
      search,
      status,
      page: 'students',
      error: req.query.error || (selectedStudent ? '' : 'Unable to load applicant details'),
      success: req.query.success || ''
    });
  } catch (error) {
    console.error('Error in /students/view/:id route:', error);
    res.render('admin-students', {
      students: [],
      studentSchedules: [],
      selectedStudent: null,
      selectedStudentId: null,
      search: req.query.search || '',
      status: req.query.status || 'all',
      page: 'students',
      error: `Failed to load students: ${error.message}`,
      success: ''
    });
  }
});

// Students List Page
router.get('/students', isAdmin, async (req, res) => {
  try {
    console.log('=== STUDENTS PAGE ===');
    console.log('Query params:', req.query);
    
    // Build query for filtering
    let query = { role: 'student', isVerified: true };
    
    // Filter by search term if provided
    if (req.query.search && req.query.search.trim()) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [
        { fullName: searchRegex },
        { email: searchRegex }
      ];
    }
    
    // Filter by status if provided and not 'all'
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }
    
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
      search: req.query.search || '',
      status: req.query.status || 'all',
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

    // Log student deletion in activity log
    await Notification.create({
      recipientId: student._id,
      recipientEmail: student.email,
      subject: 'Student Account Deleted',
      body: `Admin deleted student account: ${student.fullName} (${student.email}). All associated schedules were also removed.`,
      status: 'sent'
    });

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
      statusMessage = 'Congratulations! Your application has been approved.';
      emailSubject = 'Admission Decision: APPROVED - Bachelor of Science in Information Technology (BSIT)';
      emailBody = `Dear Applicant,\n\nCongratulations!\n\nWe are delighted to inform you that you have SUCCESSFULLY PASSED the entrance examination for the Bachelor of Science in Information Technology (BSIT) program.\n\n═══════════════════════════════════════════════════════════════════════════════\nADMISSION STATUS\n═══════════════════════════════════════════════════════════════════════════════\n\nAdmission Status: APPROVED\nProgram: Bachelor of Science in Information Technology (BSIT)\nDecision Date: ${new Date().toLocaleDateString()}\n\nYour outstanding performance on the entrance examination demonstrates the technical knowledge and analytical ability required to succeed in our rigorous IT program.\n\n═══════════════════════════════════════════════════════════════════════════════\nNEXT STEPS\n═══════════════════════════════════════════════════════════════════════════════\n\n1. Check your email for your official exam schedule confirmation\n2. Review all exam details including date, time, and location\n3. Prepare for your enrollment procedures as instructed\n4. Contact our Admissions Office for any clarifications\n\nWe are excited to welcome you to our academic community. We look forward to supporting your educational journey and helping you develop the skills needed for a successful career in Information Technology.\n\nShould you have any questions or require further information, please contact our Admissions Office.\n\nOnce again, congratulations on your achievement!\n\nWarm regards,\n\nAdmissions Office\nBachelor of Science in Information Technology Program\nEntranceExam Administration`;
    } else if (status === 'failed') {
      statusMessage = 'Your application was not approved at this time.';
      emailSubject = 'Admission Decision: NOT APPROVED - Entrance Examination Results';
      emailBody = `Dear Applicant,\n\nRe: Entrance Examination Results for BSIT Program\n\nWe sincerely appreciate your interest in the Bachelor of Science in Information Technology (BSIT) program and the effort you invested in preparing for and taking the entrance examination.\n\n═══════════════════════════════════════════════════════════════════════════════\nADMISSION STATUS\n═══════════════════════════════════════════════════════════════════════════════\n\nAdmission Status: NOT APPROVED\nProgram: Bachelor of Science in Information Technology (BSIT)\nDecision Date: ${new Date().toLocaleDateString()}\n\n═══════════════════════════════════════════════════════════════════════════════\nRECOMMENDATIONS\n═══════════════════════════════════════════════════════════════════════════════\n\nUnfortunately, your performance on the entrance examination did not meet the minimum passing standards required for admission to the BSIT program at this time.\n\nWe encourage you to consider the following options:\n\n1. Reapply in the next admission cycle (typically offered in the following semester/academic year)\n2. Review and strengthen your foundational knowledge in mathematics and computer science concepts\n3. Participate in our preparatory workshops and review materials (if available)\n4. Contact our Admissions Office for guidance on areas for improvement\n\n═══════════════════════════════════════════════════════════════════════════════\nCONTACT INFORMATION\n═══════════════════════════════════════════════════════════════════════════════\n\nDo not hesitate to contact our Admissions Office if you would like feedback on your examination performance or guidance for future applications. We are here to support your academic aspirations.\n\nWe wish you the very best in your future endeavors.\n\nSincerely,\n\nAdmissions Office\nBachelor of Science in Information Technology Program\nEntranceExam Administration`;
    } else {
      statusMessage = 'Application is pending review.';
      emailSubject = 'Exam result: pending evaluation';
      emailBody = `Hello ${student.fullName},\n\n${statusMessage}\n\nBest regards.`;
    }

    student.resultMessage = statusMessage;

    await student.save();

    console.log('[ADMIN STATUS] Sending to:', student.email, 'status:', status, 'message:', student.resultMessage);

    // Log status update in activity log
    await Notification.create({
      recipientId: student._id,
      recipientEmail: student.email,
      subject: 'Application Status Updated',
      body: `Admin updated application status to: ${status.toUpperCase()}`,
      status: 'sent'
    });

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

// Bulk status update route
router.post('/students/bulk-status', isAdmin, async (req, res) => {
  try {
    console.log('Bulk status update request body:', JSON.stringify(req.body, null, 2));
    console.log('Session role:', req.session.role);
    console.log('Headers:', req.headers);

    let data;
    if (req.body.data) {
      try {
        data = JSON.parse(req.body.data);
      } catch (e) {
        console.log('Failed to parse JSON data, trying legacy format');
        data = req.body;
      }
    } else {
      data = req.body;
    }

    let studentIds = data.studentIds || req.body.studentIds || req.body['studentIds[]'];
    const status = data.status || req.body.status;

    console.log('Parsed data:', data);
    console.log('Raw studentIds:', studentIds, 'status:', status, 'type:', typeof studentIds);

    if (Array.isArray(studentIds)) {
      studentIds = studentIds.map(id => String(id).trim()).filter(id => id);
    } else if (typeof studentIds === 'string') {
      studentIds = studentIds.split(',').map(id => id.trim()).filter(id => id);
    } else if (studentIds && typeof studentIds === 'object') {
      studentIds = Object.values(studentIds).map(id => String(id).trim()).filter(id => id);
    } else {
      studentIds = [];
    }

    console.log('Parsed studentIds:', studentIds, 'Length:', studentIds.length);

    if (studentIds.length === 0) {
      console.log('No students selected');
      return res.redirect('/admin/students?error=No students selected');
    }

    if (!['passed', 'failed'].includes(status)) {
      console.log('Invalid status:', status);
      return res.redirect('/admin/students?error=Invalid status value');
    }

    const students = await User.find({ _id: { $in: studentIds } });
    if (students.length === 0) {
      return res.redirect('/admin/students?error=No valid students found');
    }

    let updatedCount = 0;
    let emailCount = 0;

    for (const student of students) {
      if (student.status !== status) {
        student.status = status;
        student.notificationSent = false;

        let statusMessage = '';
        let emailSubject = '';
        let emailBody = '';

        if (status === 'passed') {
          statusMessage = 'Congratulations! Your application has been approved.';
          emailSubject = 'Admission Decision: APPROVED - Bachelor of Science in Information Technology (BSIT)';
          emailBody = `Dear Applicant,\n\nCongratulations!\n\nWe are delighted to inform you that you have SUCCESSFULLY PASSED the entrance examination for the Bachelor of Science in Information Technology (BSIT) program.\n\n═══════════════════════════════════════════════════════════════════════════════\nADMISSION STATUS\n═══════════════════════════════════════════════════════════════════════════════\n\nAdmission Status: APPROVED\nProgram: Bachelor of Science in Information Technology (BSIT)\nDecision Date: ${new Date().toLocaleDateString()}\n\nYour outstanding performance on the entrance examination demonstrates the technical knowledge and analytical ability required to succeed in our rigorous IT program.\n\n═══════════════════════════════════════════════════════════════════════════════\nNEXT STEPS\n═══════════════════════════════════════════════════════════════════════════════\n\n1. Check your email for your official exam schedule confirmation\n2. Review all exam details including date, time, and location\n3. Prepare for your enrollment procedures as instructed\n4. Contact our Admissions Office for any clarifications\n\nWe are excited to welcome you to our academic community. We look forward to supporting your educational journey and helping you develop the skills needed for a successful career in Information Technology.\n\nShould you have any questions or require further information, please contact our Admissions Office.\n\nOnce again, congratulations on your achievement!\n\nWarm regards,\n\nAdmissions Office\nBachelor of Science in Information Technology Program\nEntranceExam Administration`;
        } else if (status === 'failed') {
          statusMessage = 'Your application was not approved at this time.';
          emailSubject = 'Admission Decision: NOT APPROVED - Entrance Examination Results';
          emailBody = `Dear Applicant,\n\nRe: Entrance Examination Results for BSIT Program\n\nWe sincerely appreciate your interest in the Bachelor of Science in Information Technology (BSIT) program and the effort you invested in preparing for and taking the entrance examination.\n\n═══════════════════════════════════════════════════════════════════════════════\nADMISSION STATUS\n═══════════════════════════════════════════════════════════════════════════════\n\nAdmission Status: NOT APPROVED\nProgram: Bachelor of Science in Information Technology (BSIT)\nDecision Date: ${new Date().toLocaleDateString()}\n\n═══════════════════════════════════════════════════════════════════════════════\nRECOMMENDATIONS\n═══════════════════════════════════════════════════════════════════════════════\n\nUnfortunately, your performance on the entrance examination did not meet the minimum passing standards required for admission to the BSIT program at this time.\n\nWe encourage you to consider the following options:\n\n1. Reapply in the next admission cycle (typically offered in the following semester/academic year)\n2. Review and strengthen your foundational knowledge in mathematics and computer science concepts\n3. Participate in our preparatory workshops and review materials (if available)\n4. Contact our Admissions Office for guidance on areas for improvement\n\n═══════════════════════════════════════════════════════════════════════════════\nCONTACT INFORMATION\n═══════════════════════════════════════════════════════════════════════════════\n\nDo not hesitate to contact our Admissions Office if you would like feedback on your examination performance or guidance for future applications. We are here to support your academic aspirations.\n\nWe wish you the very best in your future endeavors.\n\nSincerely,\n\nAdmissions Office\nBachelor of Science in Information Technology Program\nEntranceExam Administration`;
        }

        student.resultMessage = statusMessage;
        await student.save();
        updatedCount++;

        // Log status update in activity log
        await Notification.create({
          recipientId: student._id,
          recipientEmail: student.email,
          subject: 'Application Status Updated',
          body: `Admin updated application status to: ${status.toUpperCase()}`,
          status: 'sent'
        });

        const sent = await sendEmail({
          recipientId: student._id,
          to: student.email,
          subject: emailSubject,
          text: emailBody
        });

        if (sent) {
          student.notificationSent = true;
          await student.save();
          emailCount++;
        }
      }
    }

    const message = `Updated ${updatedCount} student(s) to ${status}. ${emailCount} notification(s) sent.`;
    return res.redirect(`/admin/students?success=${encodeURIComponent(message)}`);
  } catch (error) {
    console.error('Failed to bulk update status:', error);
    return res.redirect('/admin/students?error=Failed to update student statuses');
  }
});

// Bulk delete students and their schedules
router.post('/students/bulk-delete', isAdmin, async (req, res) => {
  try {
    console.log('Bulk delete request body:', JSON.stringify(req.body, null, 2));
    console.log('Session role:', req.session.role);
    console.log('Headers:', req.headers);

    let data;
    if (req.body.data) {
      try {
        data = JSON.parse(req.body.data);
      } catch (e) {
        console.log('Failed to parse JSON data, trying legacy format');
        data = req.body;
      }
    } else {
      data = req.body;
    }

    let studentIds = data.studentIds || req.body.studentIds || req.body['studentIds[]'];

    console.log('Parsed data:', data);
    console.log('Raw studentIds:', studentIds, 'type:', typeof studentIds);

    if (Array.isArray(studentIds)) {
      studentIds = studentIds.map(id => String(id).trim()).filter(id => id);
    } else if (typeof studentIds === 'string') {
      studentIds = studentIds.split(',').map(id => id.trim()).filter(id => id);
    } else if (studentIds && typeof studentIds === 'object') {
      studentIds = Object.values(studentIds).map(id => String(id).trim()).filter(id => id);
    } else {
      studentIds = [];
    }

    console.log('Parsed studentIds:', studentIds, 'Length:', studentIds.length);

    if (studentIds.length === 0) {
      console.log('No students selected');
      return res.redirect('/admin/students?error=No students selected');
    }

    const students = await User.find({ _id: { $in: studentIds }, role: 'student' });
    if (students.length === 0) {
      return res.redirect('/admin/students?error=No valid students found');
    }

    for (const student of students) {
      await Schedule.deleteMany({ studentId: student._id });
      await Notification.create({
        recipientId: student._id,
        recipientEmail: student.email,
        subject: 'Student Account Deleted',
        body: `Admin deleted student account: ${student.fullName} (${student.email}). All associated schedules were also removed.`,
        status: 'sent'
      });
      await User.findByIdAndDelete(student._id);
    }

    return res.redirect('/admin/students?success=Selected students deleted successfully');
  } catch (error) {
    console.error('Failed to bulk delete students:', error);
    return res.redirect('/admin/students?error=Failed to delete selected students');
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

    // Get schedule counts for capacity checking in the calendar
    const allSchedules = await Schedule.find().populate('studentId');
    const scheduleCounts = allSchedules.reduce((acc, sched) => {
      const dateKey = new Date(sched.examDate).toISOString().split('T')[0];
      acc[dateKey] = (acc[dateKey] || 0) + 1;
      return acc;
    }, {});

    res.render('edit-schedule', { 
      schedule,
      scheduleCounts,
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

    // Get student info for logging
    const student = await User.findById(schedule.studentId);
    
    // Store old values for comparison
    const oldDate = new Date(schedule.examDate).toLocaleDateString();
    const oldTime = schedule.examTime;
    const oldLocation = schedule.location;

    const dateStart = new Date(examDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateStart);
    dateEnd.setHours(23, 59, 59, 999);

    const dateCount = await Schedule.countDocuments({
      examDate: { $gte: dateStart, $lte: dateEnd },
      _id: { $ne: schedule._id }
    });

    if (dateCount >= 50) {
      return res.redirect(`/admin/edit-schedule/${id}?error=That exam date has already reached the maximum limit of 50 scheduled applicants`);
    }

    // Update the schedule
    schedule.examDate = new Date(examDate);
    schedule.examTime = examTime.trim();
    schedule.location = location.trim();

    await schedule.save();

    // Log schedule update in activity log
    await Notification.create({
      recipientId: schedule.studentId,
      recipientEmail: student?.email,
      subject: 'Schedule Updated',
      body: `Admin updated exam schedule from [${oldDate} at ${oldTime} in ${oldLocation}] to [${new Date(examDate).toLocaleDateString()} at ${examTime.trim()} in ${location.trim()}]`,
      status: 'sent'
    });

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

    // Get student info for logging
    const student = await User.findById(schedule.studentId);
    
    // Log schedule deletion in activity log
    await Notification.create({
      recipientId: schedule.studentId,
      recipientEmail: student?.email,
      subject: 'Schedule Deleted',
      body: `Admin deleted exam schedule: ${new Date(schedule.examDate).toLocaleDateString()} at ${schedule.examTime} in ${schedule.location}`,
      status: 'sent'
    });

    await Schedule.findByIdAndDelete(id);
    return res.redirect('/admin/add-schedule?success=Schedule deleted successfully');
  } catch (error) {
    console.error('Failed to delete schedule:', error);
    return res.redirect('/admin/add-schedule?error=Failed to delete schedule');
  }
});

module.exports = router;