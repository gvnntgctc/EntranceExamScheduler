require('dotenv').config();
const mongoose = require('mongoose');
const Schedule = require('./models/Schedule');
const User = require('./models/User');
const Notification = require('./models/Notification');
const { buildEmailHtml, sendEmail } = require('./utils/emailUtils');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  // Find an existing schedule
  const sched = await Schedule.findOne().populate('studentId').exec();
  if (!sched) {
    console.error('No schedule found in DB to test');
    process.exit(1);
  }

  console.log('Found schedule:', sched._id.toString(), 'for', sched.studentId?.email || 'no-email');

  const oldDate = sched.examDate ? new Date(sched.examDate).toISOString().slice(0,10) : null;
  const oldTime = sched.examTime || '';
  const oldLocation = sched.location || '';

  // Choose a different time slot for test
  const timeOptions = ['7:00-8:30 A.M','9:00-10:30 A.M','1:30-3:00 P.M','3:30-5:00 P.M'];
  const newTime = timeOptions.find(t => t !== oldTime) || timeOptions[0];

  // Choose a different location
  const locations = ['3rd Floor Room 301 PTC Main Campus','3rd Floor Room 302 PTC Main Campus','3rd Floor Room 303 PTC Main Campus'];
  const newLocation = locations.find(l => l !== oldLocation) || locations[0];

  // Change date by adding 1 day for test
  const parsed = new Date(sched.examDate || new Date());
  parsed.setDate(parsed.getDate() + 1);
  const newDateIso = parsed.toISOString().slice(0,10);

  const changed = (oldDate !== newDateIso) || (oldTime !== newTime) || (oldLocation !== newLocation);
  if (!changed) {
    console.log('No effective change detected - adjusting time to force change');
  }

  // Apply updates
  sched.examDate = new Date(newDateIso);
  sched.examTime = newTime;
  sched.location = newLocation;
  await sched.save();
  console.log('Saved updated schedule');

  // Build email
  const student = await User.findById(sched.studentId).lean();
  const changeParts = [];
  if (oldDate !== newDateIso) changeParts.push(`Date: ${new Date(newDateIso).toLocaleDateString()}`);
  if (oldTime !== newTime) changeParts.push(`Time: ${newTime}`);
  if (oldLocation !== newLocation) changeParts.push(`Location: ${newLocation}`);

  const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : '';
  const html = buildEmailHtml({
    appName: 'PTC Admission System',
    systemName: 'Pateros Technological College',
    heroText: 'Your exam schedule has been updated.',
    greetingName: student?.fullName || student?.email,
    heading: 'Exam Schedule Updated',
    introText: 'Your examination schedule was recently updated by the Admissions Office. Please review the new details below and take note of the changes.',
    applicantDetails: [
      { label: 'Applicant Name', value: student?.fullName || '' },
      { label: 'Email Address', value: student?.email || '' }
    ],
    examDetails: [
      { label: 'Exam Date', value: new Date(newDateIso).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
      { label: 'Exam Time', value: newTime },
      { label: 'Exam Location', value: newLocation }
    ],
    statusLabel: 'Schedule Updated',
    statusMessage: `Your schedule was updated. Changes: ${changeParts.join(', ')}`,
    buttonText: appUrl ? 'Visit Applicant Portal' : '',
    buttonUrl: appUrl ? `${appUrl}/auth/login` : '',
    footerNote: 'If you have any questions, please contact the Admissions Office.',
    logoUrl: appUrl ? `${appUrl}/images/logo.png` : ''
  });

  const sent = await sendEmail({ to: student?.email || process.env.EMAIL_USER, subject: 'Exam Schedule Updated - Test', text: 'Your schedule has been updated. Please view HTML email.', html });
  console.log('sendEmail result:', sent);

  // Create a Notification record to mirror admin flow
  await Notification.create({ recipientId: sched.studentId, recipientEmail: student?.email, subject: 'Schedule Updated (test)', body: `Test: updated to ${newDateIso} ${newTime} ${newLocation}`, status: sent ? 'sent' : 'failed' });

  await mongoose.disconnect();
  console.log('Disconnected and finished');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
