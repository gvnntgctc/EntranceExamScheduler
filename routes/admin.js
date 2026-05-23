const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
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
const AdmissionSettings = require('../models/AdmissionSettings');
const NotificationTemplate = require('../models/NotificationTemplate');
const RescheduleRequest = require('../models/RescheduleRequest');
const { buildEmailHtml } = require('../utils/emailUtils');
const {
  formatLongDate,
  getAdmissionSettings,
  getAllowedMonths,
  getHolidayName,
  getSlotCapacity,
  toDateInputValue,
  validateSettingsPayload
} = require('../utils/admissionSettings');

const MAX_CUSTOM_FIELD_LENGTH = 120;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeIdList(value) {
  const rawIds = Array.isArray(value) ? value : (value ? [value] : []);
  return rawIds
    .flatMap(id => String(id || '').split(','))
    .map(id => id.trim())
    .filter(Boolean);
}

function hasDuplicateValues(items) {
  return new Set(items).size !== items.length;
}

function parseExamDateValue(examDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(examDate || '');
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsedDate = new Date(year, monthIndex, day);
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== monthIndex ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }
  return parsedDate;
}

function isWeekendDate(dateValue) {
  const parsedDate = parseExamDateValue(dateValue);
  if (!parsedDate) return false;
  const dayOfWeek = parsedDate.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function getExamDateRange(examDate) {
  const dateStart = parseExamDateValue(examDate);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(dateStart);
  dateEnd.setHours(23, 59, 59, 999);
  return { dateStart, dateEnd };
}

function buildScheduleViewConfig(settings) {
  const rooms = (settings.rooms || []).filter(room => room.active !== false).map(room => room.name);
  const timeSlots = (settings.timeSlots || []).filter(slot => slot.active !== false).map(slot => slot.label);
  return {
    schoolYear: settings.schoolYear,
    minDate: toDateInputValue(settings.cycleStartDate),
    maxDate: toDateInputValue(settings.cycleEndDate),
    cycleLabel: `${formatLongDate(settings.cycleStartDate)} to ${formatLongDate(settings.cycleEndDate)}`,
    allowedMonths: getAllowedMonths(settings),
    holidays: settings.holidays || [],
    rooms,
    timeSlots,
    dailyCapacityFallback: settings.dailyCapacityFallback,
    slotCapacities: settings.slotCapacities || []
  };
}

async function getSlotUsage({ examDate, examTime, location, excludeScheduleId = null }) {
  const { dateStart, dateEnd } = getExamDateRange(examDate);
  const query = { examDate: { $gte: dateStart, $lte: dateEnd }, examTime, location };
  if (excludeScheduleId) query._id = { $ne: excludeScheduleId };
  return Schedule.countDocuments(query);
}

async function validateSlotCapacity({ settings, examDate, examTime, location, requestedSeats = 1, excludeScheduleId = null }) {
  const maxCapacity = getSlotCapacity(settings, location, examTime);
  const bookedCount = await getSlotUsage({ examDate, examTime, location, excludeScheduleId });
  const remaining = Math.max(0, maxCapacity - bookedCount);
  if (requestedSeats > remaining) {
    return {
      ok: false,
      bookedCount,
      maxCapacity,
      remaining,
      message: `This room and time slot only has ${remaining} remaining slot(s). Capacity is ${maxCapacity}.`
    };
  }
  return { ok: true, bookedCount, maxCapacity, remaining };
}

function buildSlotUsageMap(schedules = []) {
  return schedules.reduce((acc, schedule) => {
    const dateKey = toDateInputValue(schedule.examDate);
    const key = `${dateKey}|||${schedule.location || ''}|||${schedule.examTime || ''}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function getPermitCode(schedule) {
  const id = schedule?._id ? schedule._id.toString().slice(-8).toUpperCase() : 'PENDING';
  return schedule?.permitCode || `PTC-${id}`;
}

function validateScheduleFields({ examDate, examTime, location }, settings) {
  if (!examDate || !examTime || !location) {
    return 'All fields are required';
  }

  if (examTime.length > MAX_CUSTOM_FIELD_LENGTH) {
    return 'Exam time must be 120 characters or less';
  }

  if (location.length > MAX_CUSTOM_FIELD_LENGTH) {
    return 'Exam location must be 120 characters or less';
  }

  const parsedExamDate = parseExamDateValue(examDate);
  if (!parsedExamDate) {
    return 'Invalid exam date';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsedExamDate < today || parsedExamDate < settings.cycleStartDate || parsedExamDate > settings.cycleEndDate) {
    return `Exam date must be between ${formatLongDate(settings.cycleStartDate)} and ${formatLongDate(settings.cycleEndDate)}`;
  }

  const holidayName = getHolidayName(settings, examDate);
  if (holidayName) {
    return `Cannot schedule on holiday: ${holidayName}`;
  }

  if (!(settings.scheduleWeekdays || [0, 6]).includes(parsedExamDate.getDay())) {
    return 'Exam schedules are only available on Saturday and Sunday';
  }

  return '';
}

function buildNotificationAction(notification) {
  const subject = (notification.subject || '').toLowerCase();
  const body = (notification.body || '').toLowerCase();
  const failed = notification.status === 'failed';
  const suffix = failed ? ' (failed)' : '';

  // Schedule actions
  if (subject.includes('schedule added') || body.includes('created exam schedule')) {
    return `✅ Schedule Created${suffix}`;
  }
  if (subject.includes('schedule updated') || body.includes('updated exam schedule')) {
    return `📝 Schedule Updated${suffix}`;
  }
  if (subject.includes('schedule deleted') || body.includes('deleted exam schedule')) {
    return `🗑️ Schedule Deleted${suffix}`;
  }
  
  // Student deletion
  if (subject.includes('student account deleted') || body.includes('deleted student account')) {
    return `❌ Student Account Deleted${suffix}`;
  }
  
  // Application status
  if (subject.includes('application status updated') || subject.includes('status updated')) {
    const statusMatch = body.match(/status to:\s*(passed|failed|pending|approved|not approved)/i);
    if (statusMatch) {
      const statusText = statusMatch[1].toUpperCase();
      return `📋 Application Status Updated to ${statusText}${suffix}`;
    }
    return `📋 Application Status Updated${suffix}`;
  }
  
  // Admission decisions (emails)
  if (subject.includes('admission decision') || subject.includes('approved') || subject.includes('not approved')) {
    if (subject.includes('approved')) {
      return `📧 Admission Approval Email sent${suffix}`;
    }
    return `📧 Admission Decision Email sent${suffix}`;
  }
  
  // Exam schedule confirmation emails
  if (subject.includes('examination schedule confirmation') || subject.includes('exam schedule')) {
    return `📧 Schedule Confirmation Email sent${suffix}`;
  }
  
  // Registration/verification emails
  if (subject.includes('registration') || subject.includes('verification')) {
    return `📧 Registration Email sent${suffix}`;
  }
  
  // Generic email notification
  if (subject.includes('email') || notification.subject?.includes('sent')) {
    return `📧 Email sent${suffix}`;
  }
  
  return `📧 Notification sent${suffix}`;
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

async function sendEmail({ recipientId, to, subject, text, html }) {
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
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
      html
    };

    const logoCid = 'ptc-logo@ptcadmission';
    const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo.png');
    if (html && html.includes(`cid:${logoCid}`) && fs.existsSync(logoPath)) {
      mailOptions.attachments = [
        {
          filename: 'logo.png',
          path: logoPath,
          cid: logoCid
        }
      ];
    }

    console.log('[SEND-EMAIL] htmlLength:', html ? html.length : 'NO HTML', 'htmlExists:', !!html, 'textLength:', text ? text.length : 0);
    if (html && html.length < 100) {
      console.log('[SEND-EMAIL] WARNING: HTML is suspiciously short. Content:', html.substring(0, 100));
    }
    await transporter.sendMail(mailOptions);

    await Notification.create({ recipientId, recipientEmail: to, subject, body: text, status: 'sent' });
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    await Notification.create({ recipientId, recipientEmail: to, subject, body: text, status: 'failed', errorMessage: error.message || String(error) });
    return false;
  }
}

function buildScheduleEmailPayload({ student, examDate, examTime, location }) {
  const formattedExamDate = new Date(examDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const scheduleEmail = `Dear ${student.fullName || student.email},\n\nRe: Official Exam Schedule - Bachelor of Science in Information Technology Program\n\nWe are writing to confirm your examination schedule for the BSIT entrance examination.\n\nExamination Date: ${formattedExamDate}\nExamination Time: ${examTime}\nExamination Location: ${location}\n\nImportant Instructions:\n- Arrive at least 15 minutes before your scheduled examination time.\n- Bring a valid government-issued ID.\n- Do not bring mobile phones, calculators, notes, or unauthorized materials.\n- Professional attire is recommended.\n\nIf you have any questions, please contact our Admissions Office.\n\nBest wishes for your examination!\n\nAdmissions Office\nBachelor of Science in Information Technology Program\nEntranceExam Administration`;
  const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : '';
  const scheduleHtml = buildEmailHtml({
    appName: 'PTC Admission System',
    systemName: 'Pateros Technological College',
    heroText: 'Your official examination schedule has been confirmed.',
    greetingName: student.fullName || student.email,
    heading: 'Exam Schedule Confirmation',
    introText: 'Thank you for completing your application. Below are the official details for your upcoming exam.',
    applicantDetails: [
      { label: 'Applicant Name', value: student.fullName || student.email },
      { label: 'Email Address', value: student.email }
    ],
    examDetails: [
      { label: 'Exam Date', value: formattedExamDate },
      { label: 'Exam Time', value: examTime },
      { label: 'Exam Location', value: location }
    ],
    statusLabel: 'Schedule Confirmed',
    statusMessage: 'Please arrive at least 15 minutes early and bring a valid government-issued ID for verification.',
    importantInstructions: 'Follow these instructions to ensure a smooth exam day experience.',
    instructionItems: [
      'Arrive at least 15 minutes before your scheduled exam time.',
      'Bring a valid government-issued ID for verification.',
      'Do not bring mobile phones, calculators, notes, or unauthorized materials.',
      'Professional attire is recommended for the entrance exam.'
    ],
    buttonText: appUrl ? 'Visit Applicant Portal' : '',
    buttonUrl: appUrl ? `${appUrl}/auth/login` : '',
    footerNote: 'If you have any questions or need assistance, please contact the Admissions Office.',
    logoUrl: appUrl ? `${appUrl}/images/logo.png` : ''
  });

  return { text: scheduleEmail, html: scheduleHtml };
}

// Middleware: Admin check
function isAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  res.redirect('/auth/login');
}

// Admin Dashboard redirects to Weekly Schedule page
router.get('/', isAdmin, (req, res) => {
  return res.redirect('/admin/dashboard');
});

router.get('/dashboard', isAdmin, async (req, res) => {
  try {
    const settings = await getAdmissionSettings();
    const [totalApplicants, pendingReview, scheduled, passed, failed, schedules] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'student', status: 'pending' }),
      Schedule.countDocuments({ examDate: { $gte: settings.cycleStartDate, $lte: settings.cycleEndDate } }),
      User.countDocuments({ role: 'student', status: 'passed' }),
      User.countDocuments({ role: 'student', status: 'failed' }),
      Schedule.find({ examDate: { $gte: settings.cycleStartDate, $lte: settings.cycleEndDate } }).lean()
    ]);
    const usage = buildSlotUsageMap(schedules);
    let totalCapacity = 0;
    const cursor = new Date(settings.cycleStartDate);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= settings.cycleEndDate) {
      const dateKey = toDateInputValue(cursor);
      if ((settings.scheduleWeekdays || [0, 6]).includes(cursor.getDay()) && !getHolidayName(settings, dateKey)) {
        totalCapacity += (settings.slotCapacities || []).reduce((sum, slot) => sum + Number(slot.capacity || 0), 0);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    const busiest = Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, count]) => {
      const [date, room, timeSlot] = key.split('|||');
      return { date, room, timeSlot, count };
    });
    res.render('admin-dashboard', {
      metrics: { totalApplicants, pendingReview, scheduled, passed, failed, remainingSlots: Math.max(0, totalCapacity - scheduled), busiest },
      page: 'dashboard',
      error: '',
      success: ''
    });
  } catch (error) {
    console.error('Failed to load dashboard:', error);
    res.redirect('/admin/weekly-schedule?error=Failed to load dashboard');
  }
});

// Monthly Schedule Grid Page (12 months view)
router.get('/weekly-schedule', isAdmin, async (req, res) => {
  try {
    const settings = await getAdmissionSettings();
    const scheduleConfig = buildScheduleViewConfig(settings);
    const allowedMonthNumbers = scheduleConfig.allowedMonths.map(month => month.monthNumber);
    const schedules = await Schedule.find().populate('studentId');
    const currentYear = settings.cycleStartDate.getFullYear();

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
      .filter(schedule => new Date(schedule.examDate) >= today && new Date(schedule.examDate) >= settings.cycleStartDate && new Date(schedule.examDate) <= settings.cycleEndDate)
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
      scheduleConfig,
      allowedMonthNumbers,
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
      scheduleConfig: buildScheduleViewConfig(await getAdmissionSettings()),
      allowedMonthNumbers: [],
      page: 'weekly',
      error: 'Failed to load schedules',
      success: ''
    });
  }
});

// Month Detail Calendar Page
router.get('/month/:month', isAdmin, async (req, res) => {
  try {
    const settings = await getAdmissionSettings();
    const scheduleConfig = buildScheduleViewConfig(settings);
    const month = parseInt(req.params.month);
    
    const allowedMonthNumbers = scheduleConfig.allowedMonths.map(item => item.monthNumber);
    if (month < 1 || month > 12 || !allowedMonthNumbers.includes(month)) {
      return res.redirect('/admin/weekly-schedule?error=Month is outside the configured admission cycle');
    }

    const year = (scheduleConfig.allowedMonths.find(item => item.monthNumber === month) || {}).year || settings.cycleStartDate.getFullYear();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month - 1];

    // Get all schedules for this month
    const schedules = await Schedule.find().populate('studentId');
    const schedulesList = [];
    const schedulesMap = {};

    schedules
      .filter(schedule => {
        const d = new Date(schedule.examDate);
        return d.getFullYear() === year && d.getMonth() === month - 1;
      })
      .sort((a, b) => {
        const dateA = new Date(a.examDate);
        const dateB = new Date(b.examDate);
        if (dateA - dateB !== 0) return dateA - dateB;
        if (a.examTime !== b.examTime) return a.examTime.localeCompare(b.examTime, 'en-US', { numeric: true });
        const nameA = a.studentId?.fullName || '';
        const nameB = b.studentId?.fullName || '';
        return nameA.localeCompare(nameB, 'en-US', { numeric: true });
      })
      .forEach(schedule => {
        const d = new Date(schedule.examDate);
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
      });

    res.render('month-detail', { 
      month,
      year,
      monthName,
      schedulesMap,
      schedulesList,
      holidayMap: (settings.holidays || []).reduce((acc, holiday) => {
        acc[holiday.date] = holiday.name;
        if (/^\d{4}-\d{2}-\d{2}$/.test(holiday.date)) acc[holiday.date.slice(5)] = holiday.name;
        return acc;
      }, {}),
      scheduleConfig,
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

// Export schedule applicants for a selected exam date as XLSX
router.get('/export-schedule', isAdmin, async (req, res) => {
  try {
    const { examDate, filter = 'all', search = '' } = req.query;

    if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
      return res.status(400).json({ error: 'Invalid exam date' });
    }

    const parsedDate = new Date(`${examDate}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid exam date' });
    }

    const startOfDay = new Date(`${examDate}T00:00:00.000Z`);
    const endOfDay = new Date(`${examDate}T23:59:59.999Z`);

    let schedules = await Schedule.find({
      examDate: { $gte: startOfDay, $lte: endOfDay }
    }).populate('studentId');

    schedules = schedules
      .filter(schedule => schedule.studentId)
      .sort((a, b) => {
        if (a.examTime !== b.examTime) {
          return a.examTime.localeCompare(b.examTime, 'en-US', { numeric: true });
        }
        const nameA = a.studentId.fullName || '';
        const nameB = b.studentId.fullName || '';
        return nameA.localeCompare(nameB, 'en-US', { numeric: true });
      });

    const normalizedFilter = ['am', 'pm'].includes(filter.toLowerCase()) ? filter.toLowerCase() : 'all';
    const normalizedSearch = (search || '').trim().toLowerCase();

    const matchesFilter = schedule => {
      if (normalizedFilter === 'all') return true;
      const examTime = (schedule.examTime || '').toLowerCase();
      if (normalizedFilter === 'am') return examTime.includes('a.m') || examTime.includes('am');
      if (normalizedFilter === 'pm') return examTime.includes('p.m') || examTime.includes('pm');
      return true;
    };

    const matchesSearch = schedule => {
      if (!normalizedSearch) return true;
      const name = (schedule.studentId.fullName || '').toLowerCase();
      const email = (schedule.studentId.email || '').toLowerCase();
      const time = (schedule.examTime || '').toLowerCase();
      return name.includes(normalizedSearch) || email.includes(normalizedSearch) || time.includes(normalizedSearch);
    };

    const exportRows = schedules.filter(schedule => matchesFilter(schedule) && matchesSearch(schedule));

    if (exportRows.length === 0) {
      return res.status(400).json({ error: 'No applicants found for the selected exam date and filters.' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Exam Schedule');

    const rowsData = exportRows.map(schedule => ({
      fullName: schedule.studentId.fullName || '',
      examDate: schedule.examDate ? new Date(schedule.examDate) : '',
      examTime: schedule.examTime || '',
      examLocation: schedule.location || ''
    }));

    worksheet.columns = [
      { header: 'Applicant Name', key: 'fullName', width: 32 },
      { header: 'Exam Date', key: 'examDate', width: 18 },
      { header: 'Exam Time', key: 'examTime', width: 18 },
      { header: 'Exam Location', key: 'examLocation', width: 32 }
    ];

    const maxColumnWidths = worksheet.columns.map(column => {
      const headerLength = column.header.length;
      const dataMaxLength = rowsData.reduce((max, row) => {
        const value = row[column.key] || '';
        const length = value instanceof Date ? 10 : String(value).length;
        return Math.max(max, length);
      }, 0);
      return Math.min(Math.max(headerLength, dataMaxLength) + 2, 50);
    });

    worksheet.columns.forEach((column, index) => {
      column.width = maxColumnWidths[index];
      column.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 24;

    rowsData.forEach(rowData => {
      worksheet.addRow(rowData);
    });

    const examDateColumn = worksheet.getColumn('examDate');
    examDateColumn.numFmt = 'mm/dd/yyyy';

    worksheet.eachRow({ includeEmpty: false }, row => {
      row.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `exam-schedule-${examDate}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Failed to export exam schedule:', error);
    return res.status(500).json({ error: 'Server error while exporting exam schedule' });
  }
});

router.get('/schedule-slot-status', isAdmin, async (req, res) => {
  try {
    const settings = await getAdmissionSettings();
    const examDate = String(req.query.examDate || '').trim();
    const examTime = String(req.query.examTime || '').trim();
    const location = String(req.query.location || '').trim();
    const validationError = validateScheduleFields({ examDate, examTime, location }, settings);
    if (validationError) {
      return res.status(400).json({ ok: false, message: validationError });
    }
    const capacity = await validateSlotCapacity({ settings, examDate, examTime, location, requestedSeats: 0 });
    return res.json({ ok: true, ...capacity });
  } catch (error) {
    console.error('Failed to load slot status:', error);
    return res.status(500).json({ ok: false, message: 'Failed to load slot status' });
  }
});

router.get('/availability', isAdmin, async (req, res) => {
  try {
    const settings = await getAdmissionSettings();
    const scheduleConfig = buildScheduleViewConfig(settings);
    const schedules = await Schedule.find({
      examDate: { $gte: settings.cycleStartDate, $lte: settings.cycleEndDate }
    }).lean();
    const usage = buildSlotUsageMap(schedules);
    const days = [];
    const cursor = new Date(settings.cycleStartDate);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= settings.cycleEndDate) {
      const dateKey = toDateInputValue(cursor);
      const holidayName = getHolidayName(settings, dateKey);
      if ((settings.scheduleWeekdays || [0, 6]).includes(cursor.getDay()) || holidayName) {
        days.push({
          dateKey,
          displayDate: cursor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
          holidayName,
          slots: scheduleConfig.rooms.flatMap(room => scheduleConfig.timeSlots.map(timeSlot => {
            const bookedCount = usage[`${dateKey}|||${room}|||${timeSlot}`] || 0;
            const maxCapacity = getSlotCapacity(settings, room, timeSlot);
            return { room, timeSlot, bookedCount, maxCapacity, remaining: Math.max(0, maxCapacity - bookedCount) };
          }))
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    res.render('schedule-availability', {
      days,
      scheduleConfig,
      page: 'availability',
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    console.error('Failed to load availability:', error);
    res.redirect('/admin/weekly-schedule?error=Failed to load availability');
  }
});

router.get('/settings', isAdmin, async (req, res) => {
  const settings = await getAdmissionSettings();
  res.render('admin-settings', {
    settings,
    scheduleConfig: buildScheduleViewConfig(settings),
    capacityFieldName: (room, timeSlot) => `capacity__${Buffer.from(`${room}|||${timeSlot}`).toString('base64')}`,
    page: 'settings',
    error: req.query.error || '',
    success: req.query.success || ''
  });
});

router.post('/settings', isAdmin, async (req, res) => {
  try {
    const result = validateSettingsPayload(req.body);
    if (result.errors.length) {
      return res.redirect(`/admin/settings?error=${encodeURIComponent(result.errors.join(' '))}`);
    }
    await AdmissionSettings.findOneAndUpdate(
      { key: 'default' },
      { $set: { ...result.settings, key: 'default' } },
      { upsert: true, runValidators: true }
    );
    await Notification.create({
      recipientEmail: req.session.email || 'admin',
      subject: 'Admission Settings Updated',
      body: `Admin updated admission settings for ${result.settings.schoolYear}`,
      status: 'sent',
      channel: 'system',
      actionType: 'settings_updated'
    });
    return res.redirect('/admin/settings?success=Settings saved');
  } catch (error) {
    console.error('Failed to save settings:', error);
    return res.redirect('/admin/settings?error=Failed to save settings');
  }
});

const TEMPLATE_PLACEHOLDERS = ['applicantName', 'date', 'time', 'room', 'referenceNumber'];

function renderTemplate(text, data) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!TEMPLATE_PLACEHOLDERS.includes(key)) return `[invalid:${key}]`;
    return data[key] || '';
  });
}

router.get('/templates', isAdmin, async (req, res) => {
  const templates = await NotificationTemplate.find().sort({ name: 1 });
  res.render('notification-templates', {
    templates,
    placeholders: TEMPLATE_PLACEHOLDERS,
    preview: null,
    page: 'templates',
    error: req.query.error || '',
    success: req.query.success || ''
  });
});

router.post('/templates', isAdmin, async (req, res) => {
  try {
    const key = String(req.body.key || '').trim();
    const name = String(req.body.name || '').trim();
    const subject = String(req.body.subject || '').trim();
    const body = String(req.body.body || '').trim();
    if (!key || !name || !body) return res.redirect('/admin/templates?error=Template key, name, and body are required');
    await NotificationTemplate.findOneAndUpdate(
      { key },
      { $set: { key, name, subject, body, channel: 'email', active: true } },
      { upsert: true, runValidators: true }
    );
    return res.redirect('/admin/templates?success=Template saved');
  } catch (error) {
    console.error('Failed to save template:', error);
    return res.redirect('/admin/templates?error=Failed to save template');
  }
});

router.post('/templates/preview', isAdmin, async (req, res) => {
  const templates = await NotificationTemplate.find().sort({ name: 1 });
  const sample = {
    applicantName: 'Sample Applicant',
    date: 'June 6, 2026',
    time: '7:00-8:30 A.M',
    room: '3rd Floor Room 301 PTC Main Campus',
    referenceNumber: 'PTC-1234ABCD'
  };
  res.render('notification-templates', {
    templates,
    placeholders: TEMPLATE_PLACEHOLDERS,
    preview: {
      subject: renderTemplate(req.body.subject, sample),
      body: renderTemplate(req.body.body, sample)
    },
    page: 'templates',
    error: '',
    success: ''
  });
});

// Add Schedule Page
router.get('/add-schedule', isAdmin, async (req, res) => {
  try {
    const settings = await getAdmissionSettings();
    const scheduleConfig = buildScheduleViewConfig(settings);
    const schedules = await Schedule.find().populate('studentId');
    const pendingStudents = await User.find({ role: 'student', status: 'pending' }).sort({ fullName: 1 });
    
    // Get IDs of students who already have a schedule
    const scheduledStudentIds = new Set(schedules.map(s => s.studentId._id.toString()));
    
    // Filter out students who already have a schedule and only include pending applicants
    const students = pendingStudents.filter(student => !scheduledStudentIds.has(student._id.toString()));

    const scheduleCounts = schedules.reduce((acc, schedule) => {
      const dateKey = toDateInputValue(schedule.examDate);
      acc[dateKey] = (acc[dateKey] || 0) + 1;
      return acc;
    }, {});

    res.render('add-schedule', { 
      schedules,
      students,
      scheduleCounts,
      slotUsage: buildSlotUsageMap(schedules),
      scheduleConfig,
      page: 'addSchedule',
      error: req.query.error || '',
      success: req.query.success || ''
    });

  } catch (error) {
    console.error(error);
    const students = [];
    const settings = await getAdmissionSettings();
    res.render('add-schedule', { 
      schedules: [], 
      students,
      scheduleCounts: {},
      slotUsage: {},
      scheduleConfig: buildScheduleViewConfig(settings),
      page: 'addSchedule',
      error: 'Failed to load schedules',
      success: ''
    });
  }
});

// Create Schedule - supports one applicant or bulk applicant selection.
router.post('/add-schedule', isAdmin, async (req, res) => {
  try {
    const settings = await getAdmissionSettings();
    const examDate = (req.body.examDate || '').trim();
    const examTime = (req.body.examTime || '').trim();
    const location = (req.body.location || '').trim();
    const validationError = validateScheduleFields({ examDate, examTime, location }, settings);
    if (validationError) {
      return res.redirect(`/admin/add-schedule?error=${encodeURIComponent(validationError)}`);
    }

    const submittedIds = normalizeIdList(req.body.studentIds || req.body['studentIds[]']);
    const studentIds = submittedIds.length > 0 ? submittedIds : normalizeIdList(req.body.studentId);
    const isBulkRequest = studentIds.length > 1 || req.body.bulkMode === '1';

    if (studentIds.length === 0) {
      return res.redirect('/admin/add-schedule?error=Please select at least one applicant');
    }

    if (hasDuplicateValues(studentIds)) {
      return res.redirect('/admin/add-schedule?error=Duplicate applicants selected. Please remove duplicates and try again.');
    }

    const invalidIds = studentIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.redirect('/admin/add-schedule?error=Invalid applicant selected');
    }

    const students = await User.find({
      _id: { $in: studentIds },
      role: 'student',
      status: 'pending',
      isVerified: true
    }).lean();

    if (students.length !== studentIds.length) {
      return res.redirect('/admin/add-schedule?error=One or more selected applicants are invalid, unverified, or already finalized');
    }

    const studentsById = new Map(students.map(student => [student._id.toString(), student]));
    const orderedStudents = studentIds.map(id => studentsById.get(id));
    const { dateStart, dateEnd } = getExamDateRange(examDate);

    const existingSchedules = await Schedule.find({
      studentId: { $in: studentIds }
    }).populate('studentId', 'fullName email').lean();

    if (existingSchedules.length > 0) {
      const names = existingSchedules
        .map(schedule => schedule.studentId?.fullName || schedule.studentId?.email || 'Selected applicant')
        .slice(0, 3)
        .join(', ');
      const suffix = existingSchedules.length > 3 ? ' and others' : '';
      return res.redirect(`/admin/add-schedule?error=${encodeURIComponent(`${names}${suffix} already have an existing schedule`)}`);
    }

    const sameSlotSchedules = await Schedule.find({
      studentId: { $in: studentIds },
      examDate: { $gte: dateStart, $lte: dateEnd },
      examTime
    }).lean();

    if (sameSlotSchedules.length > 0) {
      return res.redirect('/admin/add-schedule?error=Duplicate schedule detected for one or more selected applicants');
    }

    const slotCapacity = await validateSlotCapacity({
      settings,
      examDate,
      examTime,
      location,
      requestedSeats: orderedStudents.length
    });
    if (!slotCapacity.ok) {
      return res.redirect(`/admin/add-schedule?error=${encodeURIComponent(`${slotCapacity.message} Reduce selected applicants or choose another slot.`)}`);
    }

    const scheduleDocs = orderedStudents.map(student => ({
      studentId: student._id,
      examDate: parseExamDateValue(examDate),
      examTime,
      location
    }));

    let createdSchedules = [];
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const checkedCapacity = await validateSlotCapacity({
          settings,
          examDate,
          examTime,
          location,
          requestedSeats: orderedStudents.length
        });
        if (!checkedCapacity.ok) throw new Error(checkedCapacity.message);
        createdSchedules = await Schedule.insertMany(scheduleDocs, { session, ordered: true });
      });
    } catch (transactionError) {
      const transactionUnsupported = /Transaction numbers are only allowed|replica set|sharded cluster|Transaction.*not supported/i.test(transactionError.message || '');
      if (!transactionUnsupported) {
        throw transactionError;
      }
      console.warn('Schedule transaction unavailable, retrying with prevalidated ordered insert:', transactionError.message);
      createdSchedules = await Schedule.insertMany(scheduleDocs, { ordered: true });
    } finally {
      await session.endSession();
    }

    await Notification.insertMany(orderedStudents.map(student => ({
      recipientId: student._id,
      recipientEmail: student.email,
      subject: isBulkRequest ? 'Bulk Schedule Added' : 'Schedule Added',
      body: `Admin created exam schedule: ${new Date(examDate).toLocaleDateString()} at ${examTime} in ${location}`,
      status: 'sent',
      channel: 'system',
      actionType: 'schedule_created'
    })), { ordered: false });

    let emailSuccessCount = 0;
    for (const student of orderedStudents) {
      const emailPayload = buildScheduleEmailPayload({ student, examDate, examTime, location });
      const sent = await sendEmail({
        recipientId: student._id,
        to: student.email,
        subject: 'Official Examination Schedule Confirmation - BSIT Program',
        text: emailPayload.text,
        html: emailPayload.html
      });
      if (sent) emailSuccessCount++;
    }

    const scheduleCount = createdSchedules.length;
    const successMessage = isBulkRequest
      ? `${scheduleCount} applicant${scheduleCount === 1 ? '' : 's'} scheduled successfully. ${emailSuccessCount} email notification${emailSuccessCount === 1 ? '' : 's'} sent.`
      : `Schedule created successfully${emailSuccessCount ? ' and applicant notified' : '; applicant notification failed'}`;

    return res.redirect(`/admin/add-schedule?success=${encodeURIComponent(successMessage)}`);
  } catch (error) {
    console.error('Failed to create schedule:', error);
    if (error && error.code === 11000) {
      return res.redirect('/admin/add-schedule?error=Duplicate schedule detected. Please refresh and try again.');
    }
    return res.redirect(`/admin/add-schedule?error=${encodeURIComponent('Failed to create schedule. No applicants were scheduled.')}`);
  }
});

// Legacy single-applicant schedule handler retained off the active route.
router.post('/add-schedule-legacy', isAdmin, async (req, res) => {
  try {
    const settings = await getAdmissionSettings();
    const { studentId, examDate, examTime, location } = req.body;

    const validationError = validateScheduleFields({
      examDate: (examDate || '').trim(),
      examTime: (examTime || '').trim(),
      location: (location || '').trim()
    }, settings);
    if (!studentId || validationError) {
      return res.redirect(`/admin/add-schedule?error=${encodeURIComponent(!studentId ? 'All fields are required' : validationError)}`);
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

    if (student.status === 'passed' || student.status === 'failed') {
      return res.redirect('/admin/add-schedule?error=Cannot schedule an applicant with a finalized status');
    }

    const existingStudentSchedule = await Schedule.findOne({ studentId: student._id });
    if (existingStudentSchedule) {
      return res.redirect('/admin/add-schedule?error=This student already has an existing schedule');
    }

    // Prevent duplicate schedules for the same student on the same day
    const { dateStart, dateEnd } = getExamDateRange(examDate);
    const slotCapacity = await validateSlotCapacity({ settings, examDate, examTime: examTime.trim(), location: location.trim() });
    if (!slotCapacity.ok) {
      return res.redirect(`/admin/add-schedule?error=${encodeURIComponent(slotCapacity.message)}`);
    }

    const existing = await Schedule.findOne({ studentId: student._id, examDate: { $gte: dateStart, $lte: dateEnd } });
    if (existing) {
      return res.redirect('/admin/add-schedule?error=This student already has a scheduled exam on that day');
    }

    const newSchedule = new Schedule({
      studentId: student._id,
      examDate: parseExamDateValue(examDate),
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
      status: 'sent',
      channel: 'system',
      actionType: 'schedule_created'
    });

    // Notify applicant with schedule details
    const scheduleEmail = `Dear ${student.fullName || student.email},\n\nRe: Official Exam Schedule - Bachelor of Science in Information Technology Program\n\nWe are writing to confirm your examination schedule for the BSIT entrance examination.\n\nExamination Date: ${new Date(examDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\nExamination Time: ${examTime}\nExamination Location: ${location}\n\nImportant Instructions:\n• Arrive at least 15 minutes before your scheduled examination time.\n• Bring a valid government-issued ID.\n• Do not bring mobile phones, calculators, notes, or unauthorized materials.\n• Professional attire is recommended.\n\nIf you have any questions, please contact our Admissions Office.\n\nBest wishes for your examination!\n\nAdmissions Office\nBachelor of Science in Information Technology Program\nEntranceExam Administration`;
    const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : '';
    const scheduleHtml = buildEmailHtml({
      appName: 'PTC Admission System',
      systemName: 'Pateros Technological College',
      heroText: 'Your official examination schedule has been confirmed.',
      greetingName: student.fullName || student.email,
      heading: 'Exam Schedule Confirmation',
      introText: 'Thank you for completing your application. Below are the official details for your upcoming exam.',
      applicantDetails: [
        { label: 'Applicant Name', value: student.fullName || student.email },
        { label: 'Email Address', value: student.email }
      ],
      examDetails: [
        { label: 'Exam Date', value: new Date(examDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
        { label: 'Exam Time', value: examTime },
        { label: 'Exam Location', value: location }
      ],
      statusLabel: 'Schedule Confirmed',
      statusMessage: 'Please arrive at least 15 minutes early and bring a valid government-issued ID for verification.',
      importantInstructions: 'Follow these instructions to ensure a smooth exam day experience.',
      instructionItems: [
        'Arrive at least 15 minutes before your scheduled exam time.',
        'Bring a valid government-issued ID for verification.',
        'Do not bring mobile phones, calculators, notes, or unauthorized materials.',
        'Professional attire is recommended for the entrance exam.'
      ],
      buttonText: appUrl ? 'Visit Applicant Portal' : '',
      buttonUrl: appUrl ? `${appUrl}/auth/login` : '',
      footerNote: 'If you have any questions or need assistance, please contact the Admissions Office.',
      logoUrl: appUrl ? `${appUrl}/images/logo.png` : ''
    });

    const notificationSent = await sendEmail({
      recipientId: student._id,
      to: student.email,
      subject: 'Official Examination Schedule Confirmation - BSIT Program',
      text: scheduleEmail,
      html: scheduleHtml
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
      const safeSearch = escapeRegExp(req.query.search.trim());
      const searchRegex = new RegExp(safeSearch, 'i');
      query.$or = [
        { fullName: searchRegex },
        { email: searchRegex }
      ];
    }
    
    // Filter by status if provided and not 'all'
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }

    if (req.query.actionType && req.query.actionType !== 'all') {
      query.actionType = req.query.actionType;
    }

    if (req.query.dateFrom || req.query.dateTo) {
      query.createdAt = {};
      if (req.query.dateFrom) query.createdAt.$gte = new Date(`${req.query.dateFrom}T00:00:00`);
      if (req.query.dateTo) query.createdAt.$lte = new Date(`${req.query.dateTo}T23:59:59.999`);
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

router.get('/reschedule-requests', isAdmin, async (req, res) => {
  try {
    const requests = await RescheduleRequest.find().populate('studentId').populate('scheduleId').sort({ createdAt: -1 });
    res.render('admin-reschedule-requests', {
      requests,
      page: 'rescheduleRequests',
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    console.error('Failed to load reschedule requests:', error);
    res.redirect('/admin/weekly-schedule?error=Failed to load reschedule requests');
  }
});

router.post('/reschedule-requests/:id/status', isAdmin, async (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    if (!['approved', 'rejected'].includes(status)) {
      return res.redirect('/admin/reschedule-requests?error=Invalid request status');
    }
    const request = await RescheduleRequest.findById(req.params.id).populate('studentId');
    if (!request) return res.redirect('/admin/reschedule-requests?error=Request not found');
    request.status = status;
    request.reviewedBy = req.session.userId;
    request.reviewedAt = new Date();
    request.adminNote = String(req.body.adminNote || '').trim();
    await request.save();
    await Notification.create({
      recipientId: request.studentId?._id,
      recipientEmail: request.studentId?.email || 'unknown',
      subject: 'Reschedule Request Reviewed',
      body: `Admin marked reschedule request as ${status}. ${request.adminNote || ''}`,
      status: 'sent',
      channel: 'system',
      actionType: 'reschedule_reviewed'
    });
    return res.redirect('/admin/reschedule-requests?success=Request updated');
  } catch (error) {
    console.error('Failed to update reschedule request:', error);
    return res.redirect('/admin/reschedule-requests?error=Failed to update request');
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

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 30;

    const totalNotifications = await Notification.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(totalNotifications / limit));
    const currentPage = Math.min(page, totalPages);
    const skip = (currentPage - 1) * limit;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('recipientId');

    const notificationsWithActions = notifications.map(notification => {
      notification.actionDescription = buildNotificationAction(notification);
      return notification;
    });

    res.render('admin-notifications', {
      notifications: notificationsWithActions,
      search: req.query.search || '',
      status: req.query.status || 'all',
      actionType: req.query.actionType || 'all',
      dateFrom: req.query.dateFrom || '',
      dateTo: req.query.dateTo || '',
      currentPage,
      totalPages,
      totalNotifications,
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
      actionType: req.query.actionType || 'all',
      dateFrom: req.query.dateFrom || '',
      dateTo: req.query.dateTo || '',
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

router.post('/notifications/:id/retry', isAdmin, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.redirect('/admin/notifications?error=Notification not found');
    }
    if (notification.status !== 'failed') {
      return res.redirect('/admin/notifications?error=Only failed notifications can be retried');
    }
    const sent = await sendEmail({
      recipientId: notification.recipientId,
      to: notification.recipientEmail,
      subject: notification.subject,
      text: notification.body,
      html: notification.metadata?.html || ''
    });
    await Notification.create({
      recipientId: notification.recipientId,
      recipientEmail: notification.recipientEmail,
      subject: `Retry: ${notification.subject}`,
      body: `Retry attempted for notification ${notification._id}. Result: ${sent ? 'sent' : 'failed'}`,
      status: sent ? 'sent' : 'failed',
      errorMessage: sent ? '' : 'Provider/send function returned failure',
      channel: notification.channel || 'email',
      actionType: 'notification_retry',
      retryOf: notification._id
    });
    return res.redirect(`/admin/notifications?${sent ? 'success=Notification retry sent' : 'error=Notification retry failed'}`);
  } catch (error) {
    console.error('Failed to retry notification:', error);
    return res.redirect('/admin/notifications?error=Failed to retry notification');
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
      statusMessage = 'Congratulations! You have successfully passed in the Certificate in Computer Science (CCS) program.';
      emailSubject = 'Congratulations! You Successfully Passed in Certificate in Computer Science (CCS)';
      emailBody = `Dear Applicant,\n\nCongratulations!\n\nWe are delighted to inform you that you have SUCCESSFULLY PASSED in the Certificate in Computer Science (CCS) program.\n\n═══════════════════════════════════════════════════════════════════════════════\nADMISSION STATUS\n═══════════════════════════════════════════════════════════════════════════════\n\nAdmission Status: APPROVED\nProgram: Certificate in Computer Science (CCS)\nDecision Date: ${new Date().toLocaleDateString()}\n\nYour performance on the entrance examination qualifies you for the Certificate in Computer Science (CCS) program. This program provides a strong foundation in computing fundamentals and practical skills to prepare you for success in the technology field.\n\n═══════════════════════════════════════════════════════════════════════════════\nNEXT STEPS\n═══════════════════════════════════════════════════════════════════════════════\n\n1. Contact our Admissions Office to accept this offer and complete your enrollment\n2. Review the CCS program requirements and course schedule\n3. Prepare for your enrollment procedures as instructed\n4. Reach out with any questions about the program or next steps\n\nWe are excited to welcome you to the Certificate in Computer Science program. We look forward to supporting your academic journey and helping you develop valuable skills in computing.\n\nOnce again, congratulations on your success!\n\nWarm regards,\n\nAdmissions Office\nCertificate in Computer Science Program\nEntranceExam Administration`;
    } else {
      statusMessage = 'Application is pending review.';
      emailSubject = 'Exam result: pending evaluation';
      emailBody = `Hello ${student.fullName},\n\n${statusMessage}\n\nBest regards.`;
    }

    student.resultMessage = statusMessage;
    
    // Remove exam schedules for passed/failed students
    if (status === 'passed' || status === 'failed') {
      await Schedule.deleteMany({ studentId: student._id });
      console.log(`Removed exam schedules for student ${student._id} (${student.fullName}) - status: ${status}`);
    }

    await student.save();

    console.log('[ADMIN STATUS] Sending to:', student.email, 'status:', status, 'message:', student.resultMessage);

    // Log status update in activity log
    await Notification.create({
      recipientId: student._id,
      recipientEmail: student.email,
      subject: 'Application Status Updated',
      body: `Updated ${student.fullName}'s status to ${status.toUpperCase()}${status === 'passed' || status === 'failed' ? ' and removed exam schedules' : ''}`,
      status: 'sent'
    });

    const sent = await sendEmail({
      recipientId: student._id,
      to: student.email,
      subject: emailSubject,
      text: emailBody,
      html: emailHtml
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
    console.log('=== BULK STATUS ROUTE CALLED ===');
    console.log('Request method:', req.method);
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('Raw request body:', JSON.stringify(req.body, null, 2));
    console.log('Session role:', req.session.role);

    const isAjax = req.headers['content-type'] && req.headers['content-type'].includes('application/json');
    console.log('Is AJAX request:', isAjax);

    let studentIds;
    let status;

    if (req.body.data) {
      console.log('Found data field, attempting JSON parse...');
      try {
        const data = JSON.parse(req.body.data);
        console.log('Successfully parsed JSON data:', data);
        studentIds = data.studentIds;
        status = data.status;
      } catch (e) {
        console.log('JSON parse failed:', e.message);
        console.log('Falling back to direct body fields...');
        studentIds = req.body.studentIds || req.body['studentIds[]'];
        status = req.body.status;
      }
    } else {
      console.log('No data field found, using direct body fields...');
      studentIds = req.body.studentIds || req.body['studentIds[]'];
      status = req.body.status;
    }

    console.log('Final parsed data:', { studentIds, status });
    console.log('Student IDs type:', typeof studentIds);
    console.log('Student IDs length:', studentIds ? studentIds.length : 'undefined');

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
      const errorMsg = 'No students selected';
      console.log(errorMsg);
      if (isAjax) {
        return res.status(400).json({ success: false, message: errorMsg });
      }
      return res.redirect('/admin/students?error=No students selected');
    }

    if (!['passed', 'failed'].includes(status)) {
      const errorMsg = 'Invalid status value';
      console.log(errorMsg + ':', status);
      if (isAjax) {
        return res.status(400).json({ success: false, message: errorMsg });
      }
      return res.redirect('/admin/students?error=Invalid status value');
    }

    const students = await User.find({ _id: { $in: studentIds } });
    if (students.length === 0) {
      const errorMsg = 'No valid students found';
      if (isAjax) {
        return res.status(400).json({ success: false, message: errorMsg });
      }
      return res.redirect('/admin/students?error=No valid students found');
    }

    let updatedCount = 0;
    let emailCount = 0;

    // Process students in batches to avoid timeouts
    const batchSize = 10;
    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);
      
      for (const student of batch) {
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
            statusMessage = 'Congratulations! You have successfully passed in the Certificate in Computer Science (CCS) program.';
            emailSubject = 'Congratulations! You Successfully Passed in Certificate in Computer Science (CCS)';
            emailBody = `Dear Applicant,\n\nCongratulations!\n\nWe are delighted to inform you that you have SUCCESSFULLY PASSED in the Certificate in Computer Science (CCS) program.\n\n═══════════════════════════════════════════════════════════════════════════════\nADMISSION STATUS\n═══════════════════════════════════════════════════════════════════════════════\n\nAdmission Status: APPROVED\nProgram: Certificate in Computer Science (CCS)\nDecision Date: ${new Date().toLocaleDateString()}\n\nYour performance on the entrance examination qualifies you for the Certificate in Computer Science (CCS) program. This program provides a strong foundation in computing fundamentals and practical skills to prepare you for success in the technology field.\n\n═══════════════════════════════════════════════════════════════════════════════\nNEXT STEPS\n═══════════════════════════════════════════════════════════════════════════════\n\n1. Contact our Admissions Office to accept this offer and complete your enrollment\n2. Review the CCS program requirements and course schedule\n3. Prepare for your enrollment procedures as instructed\n4. Reach out with any questions about the program or next steps\n\nWe are excited to welcome you to the Certificate in Computer Science program. We look forward to supporting your academic journey and helping you develop valuable skills in computing.\n\nOnce again, congratulations on your success!\n\nWarm regards,\n\nAdmissions Office\nCertificate in Computer Science Program\nEntranceExam Administration`;
          }

          const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : '';
          const emailHtml = buildEmailHtml({
            appName: 'PTC Admission System',
            systemName: 'Pateros Technological College',
            heroText: 'Your admission decision is now available.',
            greetingName: student.fullName || student.email,
            heading: status === 'passed' ? 'Admission Approved' : 'Program Placement Confirmed',
            introText: status === 'passed'
              ? 'Congratulations on your successful application to the BSIT program. Please review the details below.'
              : 'Great news! You have been offered placement in the Certificate in Computer Science program.',
            applicantDetails: [
              { label: 'Applicant Name', value: student.fullName || student.email },
              { label: 'Email Address', value: student.email }
            ],
            examDetails: [
              { label: 'Program', value: status === 'passed' ? 'Bachelor of Science in Information Technology (BSIT)' : 'Certificate in Computer Science (CCS)' },
              { label: 'Decision Date', value: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }
            ],
            statusLabel: status === 'passed' ? 'Application Approved' : 'Program Placement Approved',
            statusMessage,
            buttonText: appUrl ? 'Visit Applicant Portal' : '',
            buttonUrl: appUrl ? `${appUrl}/auth/login` : '',
            footerNote: 'For questions, please contact the Admissions Office using the contact details on the portal.',
            logoUrl: appUrl ? `${appUrl}/images/logo.png` : ''
          });

          student.resultMessage = statusMessage;
          
          // Remove exam schedules for passed/failed students
          if (status === 'passed' || status === 'failed') {
            await Schedule.deleteMany({ studentId: student._id });
            console.log(`Removed exam schedules for student ${student._id} (${student.fullName}) - status: ${status}`);
          }
          
          await student.save();
          updatedCount++;

          // Log status update in activity log
          await Notification.create({
            recipientId: student._id,
            recipientEmail: student.email,
            subject: 'Application Status Updated',
            body: `Updated ${student.fullName}'s status to ${status.toUpperCase()}${status === 'passed' || status === 'failed' ? ' and removed exam schedules' : ''}`,
            status: 'sent'
          });

          const sent = await sendEmail({
            recipientId: student._id,
            to: student.email,
            subject: emailSubject,
            text: emailBody,
            html: emailHtml
          });

          if (sent) {
            student.notificationSent = true;
            await student.save();
            emailCount++;
          }
        }
      }
      
      // Small delay between batches to prevent overwhelming the server
      if (i + batchSize < students.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const message = `Updated ${updatedCount} student(s) to ${status}. ${emailCount} notification(s) sent.`;
    console.log('Bulk status update completed:', message);
    
    if (isAjax) {
      return res.json({ success: true, message });
    }
    return res.redirect(`/admin/students?success=${encodeURIComponent(message)}`);
  } catch (error) {
    console.error('Failed to bulk update status:', error);
    const errorMsg = 'Failed to update student statuses';
    if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
      return res.status(500).json({ success: false, message: errorMsg });
    }
    return res.redirect('/admin/students?error=Failed to update student statuses');
  }
});

// Bulk delete students and their schedules
router.post('/students/bulk-delete', isAdmin, async (req, res) => {
  try {
    console.log('=== BULK DELETE ROUTE CALLED ===');
    console.log('Request method:', req.method);
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('Raw request body:', JSON.stringify(req.body, null, 2));
    console.log('Session role:', req.session.role);

    const isAjax = req.headers['content-type'] && req.headers['content-type'].includes('application/json');
    console.log('Is AJAX request:', isAjax);

    let studentIds;

    if (req.body.data) {
      console.log('Found data field, attempting JSON parse...');
      try {
        const data = JSON.parse(req.body.data);
        console.log('Successfully parsed JSON data:', data);
        studentIds = data.studentIds;
      } catch (e) {
        console.log('JSON parse failed:', e.message);
        console.log('Falling back to direct body fields...');
        studentIds = req.body.studentIds || req.body['studentIds[]'];
      }
    } else {
      console.log('No data field found, using direct body fields...');
      studentIds = req.body.studentIds || req.body['studentIds[]'];
    }

    console.log('Final parsed data:', { studentIds });
    console.log('Student IDs type:', typeof studentIds);
    console.log('Student IDs length:', studentIds ? studentIds.length : 'undefined');

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
      const errorMsg = 'No students selected';
      console.log(errorMsg);
      if (isAjax) {
        return res.status(400).json({ success: false, message: errorMsg });
      }
      return res.redirect('/admin/students?error=No students selected');
    }

    const students = await User.find({ _id: { $in: studentIds }, role: 'student' });
    if (students.length === 0) {
      const errorMsg = 'No valid students found';
      if (isAjax) {
        return res.status(400).json({ success: false, message: errorMsg });
      }
      return res.redirect('/admin/students?error=No valid students found');
    }

    let deletedCount = 0;
    
    // Process deletions in batches to avoid timeouts
    const batchSize = 10;
    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);
      
      for (const student of batch) {
        await Schedule.deleteMany({ studentId: student._id });
        await Notification.create({
          recipientId: student._id,
          recipientEmail: student.email,
          subject: 'Student Account Deleted',
          body: `Admin deleted student account: ${student.fullName} (${student.email}). All associated schedules were also removed.`,
          status: 'sent'
        });
        await User.findByIdAndDelete(student._id);
        deletedCount++;
      }
      
      // Small delay between batches to prevent overwhelming the server
      if (i + batchSize < students.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const message = `Successfully deleted ${deletedCount} student(s) and their associated schedules.`;
    console.log('Bulk delete completed:', message);
    
    if (isAjax) {
      return res.json({ success: true, message });
    }
    return res.redirect('/admin/students?success=Selected students deleted successfully');
  } catch (error) {
    console.error('Failed to bulk delete students:', error);
    const errorMsg = 'Failed to delete selected students';
    if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
      return res.status(500).json({ success: false, message: errorMsg });
    }
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
      monthName: now.toLocaleString('default', { month: 'long' }),
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
    const settings = await getAdmissionSettings();
    const { id } = req.params;
    const schedule = await Schedule.findById(id).populate('studentId');
    
    if (!schedule) {
      return res.redirect('/admin/add-schedule?error=Schedule not found');
    }

    // Get schedule counts for capacity checking in the calendar
    const allSchedules = await Schedule.find().populate('studentId');
    const scheduleCounts = allSchedules.reduce((acc, sched) => {
      const dateKey = toDateInputValue(sched.examDate);
      acc[dateKey] = (acc[dateKey] || 0) + 1;
      return acc;
    }, {});

    res.render('edit-schedule', { 
      schedule,
      scheduleCounts,
      slotUsage: buildSlotUsageMap(allSchedules.filter(item => item._id.toString() !== id)),
      scheduleConfig: buildScheduleViewConfig(settings),
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
    const settings = await getAdmissionSettings();
    const { id } = req.params;
    const { examDate, examTime, location } = req.body;

    console.log('--- SCHEDULE UPDATE REQUEST RECEIVED ---');
    console.log('Schedule ID:', id);
    console.log('Incoming values:', { examDate, examTime, location });

    // Basic validation
    if (!examDate || !examTime || !location) {
      console.log('Validation failed: missing required fields', { examDate, examTime, location });
      return res.redirect(`/admin/edit-schedule/${id}?error=All fields are required`);
    }

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      console.log('Schedule not found for ID:', id);
      return res.redirect('/admin/add-schedule?error=Schedule not found');
    }

    const validationError = validateScheduleFields({
      examDate: (examDate || '').trim(),
      examTime: (examTime || '').trim(),
      location: (location || '').trim()
    }, settings);
    if (validationError) {
      console.log('Validation failed:', validationError);
      return res.redirect(`/admin/edit-schedule/${id}?error=${encodeURIComponent(validationError)}`);
    }

    // Get student info for logging
    const student = await User.findById(schedule.studentId);

    // Store old values for comparison (normalized)
    const oldDate = schedule.examDate ? new Date(schedule.examDate).toISOString().slice(0,10) : null;
    const oldTime = schedule.examTime || '';
    const oldLocation = schedule.location || '';
    console.log('Existing DB values:', { oldDate, oldTime, oldLocation });

    const slotCapacity = await validateSlotCapacity({
      settings,
      examDate,
      examTime: examTime.trim(),
      location: location.trim(),
      requestedSeats: 1,
      excludeScheduleId: schedule._id
    });

    if (!slotCapacity.ok) {
      return res.redirect(`/admin/edit-schedule/${id}?error=${encodeURIComponent(slotCapacity.message)}`);
    }

    // Detect changes (capture previous values already in oldDate/oldTime/oldLocation)
    const oldExamIso = schedule.examDate ? new Date(schedule.examDate).toISOString().slice(0, 10) : null;
    const newExamIso = examDate;
    const newExamTime = examTime.trim();
    const newLocation = location.trim();

    const dateChanged = oldExamIso !== newExamIso;
    const timeChanged = oldTime !== newExamTime;
    const locationChanged = oldLocation !== newLocation;

    console.log('Change detection result:', { dateChanged, timeChanged, locationChanged });

    if (dateChanged || timeChanged || locationChanged) {
      schedule.previousSchedules.push({
        examDate: schedule.examDate,
        examTime: oldTime,
        location: oldLocation,
        changedAt: new Date()
      });
      schedule.rescheduled = true;
      schedule.rescheduledAt = new Date();
      schedule.rescheduleCount = (schedule.rescheduleCount || 0) + 1;
    }

    // Update the schedule
    schedule.examDate = parseExamDateValue(examDate);
    schedule.examTime = newExamTime;
    schedule.location = newLocation;

    try {
      console.log('Saving schedule to DB...');
      await schedule.save();
      console.log('Schedule saved:', schedule._id.toString());
    } catch (saveErr) {
      console.error('Error saving schedule:', saveErr);
      return res.redirect(`/admin/edit-schedule/${id}?error=Failed to save schedule`);
    }

    // If any tracked field changed, send an update email to applicant
    if (dateChanged || timeChanged || locationChanged) {
      console.log('Tracked changes detected; preparing email notification');
      try {
        const changeParts = [];
        if (dateChanged) changeParts.push(`Date: ${new Date(newExamIso).toLocaleDateString()}`);
        if (timeChanged) changeParts.push(`Time: ${newExamTime}`);
        if (locationChanged) changeParts.push(`Location: ${newLocation}`);

        const subject = 'Exam Schedule Updated — PTC Admission';
        const text = `Dear ${student.fullName || student.email},\n\nYour exam schedule has been updated.\n\nUpdated details:\n${changeParts.join('\n')}\n\nPlease review the updated schedule and attend at the revised date/time/location.\n\nIf you have questions, contact the Admissions Office.`;

        const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : '';
        const html = buildEmailHtml({
          appName: 'PTC Admission System',
          systemName: 'Pateros Technological College',
          heroText: 'Your exam schedule has been updated.',
          greetingName: student.fullName || student.email,
          heading: 'Exam Schedule Updated',
          introText: 'Your examination schedule was recently updated by the Admissions Office. Please review the new details below and take note of the changes.',
          applicantDetails: [
            { label: 'Applicant Name', value: student.fullName || '' },
            { label: 'Email Address', value: student.email || '' }
          ],
          examDetails: [
            { label: 'Exam Date', value: new Date(newExamIso).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
            { label: 'Exam Time', value: newExamTime },
            { label: 'Exam Location', value: newLocation }
          ],
          statusLabel: 'Schedule Updated',
          statusMessage: `Your schedule was updated. Changes: ${changeParts.join(', ')}`,
          buttonText: appUrl ? 'Visit Applicant Portal' : '',
          buttonUrl: appUrl ? `${appUrl}/auth/login` : '',
          footerNote: 'If you have any questions, please contact the Admissions Office.',
          logoUrl: appUrl ? `${appUrl}/images/logo.png` : ''
        });

        console.log('Calling sendEmail() for applicant:', student?.email);
        const sent = await sendEmail({
          recipientId: schedule.studentId,
          to: student?.email,
          subject,
          text,
          html
        });
        console.log('sendEmail result:', sent);

        // Check recent notification record
        const recentNotif = await Notification.findOne({ recipientId: schedule.studentId }).sort({ createdAt: -1 }).lean();
        console.log('Recent notification (if any):', recentNotif ? { id: recentNotif._id, status: recentNotif.status, subject: recentNotif.subject } : 'NONE');

        if (!sent) {
          console.log('Email sending failed (sendEmail returned false)');
          return res.redirect('/admin/add-schedule?success=Schedule updated; notification failed to send');
        }
      } catch (err) {
        console.error('Failed to send schedule update email:', err);
        return res.redirect('/admin/add-schedule?success=Schedule updated; notification failed to send');
      }
    } else {
      console.log('No relevant fields changed; skipping notification');
    }

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
