const Queue = require('bull');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const emailQueue = new Queue('email-queue', {
  redis: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 }
});

// Suppress uncaught redis connection crashes
emailQueue.on('error', (err) => {
  logger.warn(`Bull email queue connection notice: ${err.message}`);
});

const customerTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
  port: process.env.SMTP_PORT || 465,
  secure: true, // Use true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER_CUSTOMER || 'donotreply@thecarbonsmith.com',
    pass: process.env.SMTP_PASS_CUSTOMER
  }
});

const opsTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
  port: process.env.SMTP_PORT || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER_OPS || 'Operations@thecarbonsmith.com',
    pass: process.env.SMTP_PASS_OPS
  }
});

const sendDirectEmail = async (emailData) => {
  const { to, cc, subject, text, html, emailType, attachments } = emailData;

  let transporter;
  let fromAddress;
  let finalCc = cc ? cc : '';

  if (emailType === 'ops') {
    transporter = opsTransporter;
    fromAddress = process.env.SMTP_USER_OPS || 'Operations@thecarbonsmith.com';
    const opsUniversalCc = 'piyush.pradeep@thecarbonsmith.com';
    finalCc = finalCc ? `${finalCc}, ${opsUniversalCc}` : opsUniversalCc;
  } else {
    transporter = customerTransporter;
    fromAddress = process.env.SMTP_USER_CUSTOMER || 'donotreply@thecarbonsmith.com';
    const customerUniversalCc = 'sales@thecarbonsmith.com, akshay.gondhali@thecarbonsmith.com';
    finalCc = finalCc ? `${finalCc}, ${customerUniversalCc}` : customerUniversalCc;
  }

  // Deduplicate CC addresses
  if (finalCc) {
    const ccSet = new Set(finalCc.split(',').map(e => e.trim()).filter(e => e));
    finalCc = Array.from(ccSet).join(', ');
  }

  const mailOptions = {
    from: `"CarbonSmith" <${fromAddress}>`,
    to,
    cc: finalCc,
    subject,
    text,
    html
  };

  if (attachments) {
    mailOptions.attachments = attachments;
  }

  await transporter.sendMail(mailOptions);
  logger.info(`[${emailType || 'customer'}] Email sent directly to ${to}`);
  return { success: true };
};

emailQueue.process(async (job) => {
  return await sendDirectEmail(job.data);
});

const sendEmail = async (emailData) => {
  try {
    await emailQueue.add(emailData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });
  } catch (queueErr) {
    logger.warn(`Email queue add failed (${queueErr.message}), sending directly...`);
    await sendDirectEmail(emailData);
  }
};

module.exports = { emailQueue, sendEmail, sendDirectEmail };
