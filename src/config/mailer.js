const nodemailer = require('nodemailer');

let testAccount = null;
let transporter = null;

const getTransporter = async () => {
  if (transporter) return transporter;

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: Number(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    // Generate test account with Ethereal for dev
    testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log(`[Mailer] Ethereal test mailer initialized: ${testAccount.user}`);
  }

  return transporter;
};

const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const transport = await getTransporter();
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || '"Campus Coin" <noreply@campuscoin.edu>',
      to,
      subject,
      text,
      html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[Mailer] Email sent! Preview URL: ${previewUrl}`);
    }
    return { success: true, messageId: info.messageId, previewUrl };
  } catch (error) {
    console.error(`[Mailer Error] Failed to send email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail, getTransporter };
