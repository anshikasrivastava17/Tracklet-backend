const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Structured logger for CloudWatch
function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'email',
    message,
    ...meta,
  };
  if (level === 'ERROR') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// Send price-drop alert email
async function sendPriceDropAlert(userEmail, productUrl, currentPrice) {
  const mailOptions = {
    from: process.env.SMTP_EMAIL,
    to: userEmail,
    subject: '🔥 Price Drop Alert!',
    html: `
      <h2>Good news! 🎉</h2>
      <p>The product you were tracking has dropped in price.</p>
      <p><strong>New Price:</strong> ₹${currentPrice}</p>
      <p><a href="${productUrl}" target="_blank">View Product</a></p>
    `,
  };

  await transporter.sendMail(mailOptions);
  log('INFO', 'EMAIL_SENT', { type: 'PRICE_DROP_ALERT', to: userEmail });
}

// Send password reset OTP email
async function sendPasswordResetEmail(toEmail, otp) {
  const mailOptions = {
    from: process.env.SMTP_EMAIL,
    to: toEmail,
    subject: '🔐 Tracklet — Password Reset Code',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0A0A0A;">Reset your Tracklet password</h2>
        <p style="color: #555;">Use the code below to reset your password. It expires in <strong>15 minutes</strong>.</p>
        <div style="
          display: inline-block;
          padding: 16px 32px;
          background: #FF6200;
          color: #fff;
          font-size: 32px;
          font-weight: 700;
          letter-spacing: 0.4em;
          border-radius: 12px;
          margin: 20px 0;
          font-family: monospace;
        ">${otp}</div>
        <p style="color: #888; font-size: 13px;">
          If you didn't request this, you can safely ignore this email.<br>
          Your password will not be changed.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  log('INFO', 'EMAIL_SENT', { type: 'PASSWORD_RESET', to: toEmail });
}

module.exports = {
  sendPriceDropAlert,
  sendPasswordResetEmail,
};
