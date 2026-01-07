const Queue = require('bull');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const emailQueue = new Queue('email-queue', {
  redis: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT }
});

const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

emailQueue.process(async (job) => {
  const { to, subject, text, html } = job.data;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text,
      html
    });

    logger.info(`Email sent to ${to}`);
    return { success: true };
  } catch (error) {
    logger.error(`Email failed to ${to}: ${error.message}`);
    throw error;
  }
});

const sendEmail = async (emailData) => {
  await emailQueue.add(emailData, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  });
};

module.exports = { emailQueue, sendEmail };