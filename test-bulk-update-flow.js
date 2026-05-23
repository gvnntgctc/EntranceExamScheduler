require('dotenv').config();
const { buildEmailHtml } = require('./utils/emailUtils');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Simulate the exact flow from bulk status update
const status = 'passed';
const student = {
  fullName: 'Test Applicant',
  email: process.env.EMAIL_USER
};

let statusMessage = '';
let emailSubject = '';
let emailBody = '';

if (status === 'passed') {
  statusMessage = 'Congratulations! Your application has been approved.';
  emailSubject = 'Admission Decision: APPROVED - Bachelor of Science in Information Technology (BSIT)';
  emailBody = `Dear Applicant,\n\nCongratulations!\n\nWe are delighted to inform you that you have SUCCESSFULLY PASSED the entrance examination for the Bachelor of Science in Information Technology (BSIT) program.\n\n═══════════════════════════════════════════════════════════════════════════════\nADMISSION STATUS\n═══════════════════════════════════════════════════════════════════════════════\n\nAdmission Status: APPROVED\nProgram: Bachelor of Science in Information Technology (BSIT)\nDecision Date: ${new Date().toLocaleDateString()}\n\nYour outstanding performance on the entrance examination demonstrates the technical knowledge and analytical ability required to succeed in our rigorous IT program.\n\n═══════════════════════════════════════════════════════════════════════════════\nNEXT STEPS\n═══════════════════════════════════════════════════════════════════════════════\n\n1. Check your email for your official exam schedule confirmation\n2. Review all exam details including date, time, and location\n3. Prepare for your enrollment procedures as instructed\n4. Contact our Admissions Office for any clarifications\n\nWe are excited to welcome you to our academic community. We look forward to supporting your educational journey and helping you develop the skills needed for a successful career in Information Technology.\n\nShould you have any questions or require further information, please contact our Admissions Office.\n\nOnce again, congratulations on your achievement!\n\nWarm regards,\n\nAdmissions Office\nBachelor of Science in Information Technology Program\nEntranceExam Administration`;
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

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('BULK STATUS UPDATE EMAIL TEST - Simulating Exact Flow');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\nGenerated HTML:');
console.log('  ✓ HTML exists:', !!emailHtml);
console.log('  ✓ HTML length:', emailHtml.length, 'characters');
console.log('  ✓ Contains DOCTYPE:', emailHtml.includes('<!doctype'));
console.log('  ✓ Contains branded colors (#11998e):', emailHtml.includes('#11998e'));
console.log('  ✓ Contains applicant details:', emailHtml.includes('Applicant Name'));
console.log('  ✓ Contains program info:', emailHtml.includes('BSIT'));
console.log('  ✓ Contains status message:', emailHtml.includes('Application Approved'));

console.log('\nPlain text fallback:');
console.log('  ✓ Text exists:', !!emailBody);
console.log('  ✓ Text length:', emailBody.length, 'characters');

console.log('\nSending email with HTML field to Gmail...\n');

transporter.sendMail({
  from: process.env.EMAIL_USER,
  to: student.email,
  subject: emailSubject,
  text: emailBody,
  html: emailHtml
}, (err, info) => {
  if (err) {
    console.error('✗ ERROR:', err.message);
    process.exit(1);
  } else {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✓ EMAIL SENT SUCCESSFULLY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nTo: ' + student.email);
    console.log('Subject: ' + emailSubject);
    console.log('Message ID: ' + info.messageId);
    console.log('\nHTML FIELD: ✓ INCLUDED');
    console.log('TEXT FIELD: ✓ INCLUDED (fallback)');
    console.log('\nExpected email appearance:');
    console.log('  • Branded teal header (#11998e)');
    console.log('  • "Admission Approved" heading');
    console.log('  • Applicant information card');
    console.log('  • Program details section');
    console.log('  • Professional footer');
    console.log('  • Modern, responsive layout');
    console.log('\n✓ Check Gmail inbox - email should render as STYLED HTML, not plain text');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(0);
  }
});
