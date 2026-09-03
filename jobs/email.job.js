const Queue = require('bull');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const emailQueue = new Queue('email-queue', {
  redis: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT }
});

const customerTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
  port: process.env.SMTP_PORT || 465,
  secure: true, // Use true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER_CUSTOMER,
    pass: process.env.SMTP_PASS_CUSTOMER
  }
});

const opsTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
  port: process.env.SMTP_PORT || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER_OPS,
    pass: process.env.SMTP_PASS_OPS
  }
});

emailQueue.process(async (job) => {
  const { to, cc, subject, text, html, emailType, attachments } = job.data;
  
  let transporter;
  let fromAddress;
  let finalCc = cc ? cc : '';

  if (emailType === 'ops') {
    transporter = opsTransporter;
    fromAddress = process.env.SMTP_USER_OPS || 'Operations@thecarbonsmith.com';
    // No universal CC for ops unless passed explicitly
  } else {
    // Default to customer email
    transporter = customerTransporter;
    fromAddress = process.env.SMTP_USER_CUSTOMER || 'donotreply@thecarbonsmith.com';
    
    // Always append support, sales, and akshay to customer emails
    const customerUniversalCc = 'support@thecarbonsmith.com, sales@thecarbonsmith.com, akshay.gondhali@thecarbonsmith.com';
    finalCc = finalCc ? `${finalCc}, ${customerUniversalCc}` : customerUniversalCc;
  }

  try {
    const mailOptions = {
      from: fromAddress,
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

    logger.info(`[${emailType || 'customer'}] Email sent to ${to}`);
    return { success: true };
  } catch (error) {
    logger.error(`[${emailType || 'customer'}] Email failed to ${to}: ${error.message}`);
    throw error;
  }
});

const sendEmail = async (emailData) => {
  // emailData should now optionally include emailType (e.g. 'ops')
  await emailQueue.add(emailData, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  });
};

module.exports = { emailQueue, sendEmail };