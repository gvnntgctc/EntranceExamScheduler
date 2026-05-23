const express = require('express');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const RescheduleRequest = require('../models/RescheduleRequest');
const Notification = require('../models/Notification');
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
    const rescheduleRequests = await RescheduleRequest.find({ studentId: req.session.userId }).sort({ createdAt: -1 }).lean();
    const timeline = [
      { label: 'Registration received', date: user.createdAt },
      { label: 'Email verified', date: user.isVerified ? user.updatedAt : null },
      { label: 'Scheduled', date: schedule?.createdAt || schedule?.examDate },
      { label: 'Rescheduled', date: schedule?.rescheduledAt },
      { label: user.status === 'passed' ? 'Passed' : (user.status === 'failed' ? 'Failed' : 'Pending review'), date: ['passed', 'failed'].includes(user.status) ? user.updatedAt : null }
    ].filter(item => item.date);
    res.render('student-dashboard', { user, schedule, rescheduleRequests, timeline, error: req.query.error || '', success: req.query.success || '' });
  } catch (err) {
    console.error(err);
    res.redirect('/auth/login');
  }
});

function escapePdfText(value) {
  return String(value || '').replace(/[\\()]/g, '\\$&');
}

function buildPermitPdf({ user, schedule }) {
  const permitCode = schedule.permitCode || `PTC-${schedule._id.toString().slice(-8).toUpperCase()}`;
  const lines = [
    'PTC Admission Exam Permit',
    `Applicant: ${user.fullName || user.email}`,
    `Reference: ${permitCode}`,
    `Date: ${new Date(schedule.examDate).toLocaleDateString('en-US')}`,
    `Time: ${schedule.examTime}`,
    `Room: ${schedule.location}`,
    'Instructions: Bring a valid ID and arrive at least 15 minutes early.'
  ];
  const textOps = lines.map((line, index) => `BT /F1 ${index === 0 ? 20 : 12} Tf 72 ${740 - (index * 28)} Td (${escapePdfText(line)}) Tj ET`).join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(textOps)} >> stream\n${textOps}\nendstream endobj`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(obj => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${obj}\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

router.get('/permit', isStudent, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const schedule = await Schedule.findOne({ studentId: req.session.userId });
    if (!schedule) return res.redirect('/student?error=No exam permit is available yet');
    const pdf = buildPermitPdf({ user, schedule });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="exam-permit.pdf"');
    return res.send(pdf);
  } catch (error) {
    console.error('Failed to generate permit:', error);
    return res.redirect('/student?error=Failed to generate permit');
  }
});

router.post('/reschedule-request', isStudent, async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ studentId: req.session.userId });
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.redirect('/student?error=Please provide a reason for your reschedule request');
    await RescheduleRequest.create({
      studentId: req.session.userId,
      scheduleId: schedule?._id,
      reason
    });
    const user = await User.findById(req.session.userId);
    await Notification.create({
      recipientId: user._id,
      recipientEmail: user.email,
      subject: 'Reschedule Request Submitted',
      body: `Applicant requested reschedule review: ${reason}`,
      status: 'sent',
      channel: 'system',
      actionType: 'reschedule_requested'
    });
    return res.redirect('/student?success=Reschedule request submitted for admin review');
  } catch (error) {
    console.error('Failed to request reschedule:', error);
    return res.redirect('/student?error=Failed to submit reschedule request');
  }
});

module.exports = router;
