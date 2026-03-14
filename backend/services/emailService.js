const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

async function sendPriceDropAlert(userEmail, productUrl, currentPrice) {
  const mailOptions = {
    from: `"Tracklet" <${process.env.SMTP_EMAIL}>`,
    to: userEmail,
    subject: '🔥 Price Drop Alert — Tracklet',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1D1D1F;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 600; color: #1D1D1F;">Tracklet</span>
        </div>
        <h2 style="font-size: 22px; font-weight: 600; margin-bottom: 8px; color: #1D1D1F;">
          Good news! 🎉
        </h2>
        <p style="font-size: 15px; color: #6E6E73; line-height: 1.6; margin-bottom: 20px;">
          A product you're tracking has dropped below your target price.
        </p>
        <div style="background: #F5F5F7; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
          <p style="font-size: 13px; color: #86868B; margin: 0 0 4px 0;">Current Price</p>
          <p style="font-size: 28px; font-weight: 700; color: #1D1D1F; margin: 0;">₹${currentPrice}</p>
        </div>
        <a href="${productUrl}" target="_blank"
           style="display: inline-block; padding: 12px 28px; background: #0071E3; color: #fff; text-decoration: none; border-radius: 980px; font-size: 15px; font-weight: 500;">
          View Product →
        </a>
        <hr style="border: none; border-top: 1px solid #E8E8ED; margin: 32px 0 16px;" />
        <p style="font-size: 12px; color: #86868B; text-align: center;">
          You're receiving this because you set a price alert on Tracklet.<br/>
          © 2026 Tracklet. On Your Terms.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`📧 Email sent to ${userEmail} for price drop.`);
}

async function sendPasswordResetOTP(userEmail, otp) {
  const mailOptions = {
    from: `"Tracklet" <${process.env.SMTP_EMAIL}>`,
    to: userEmail,
    subject: '🔒 Password Reset OTP — Tracklet',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1D1D1F;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 18px; font-weight: 600; color: #1D1D1F;">Tracklet</span>
        </div>
        <h2 style="font-size: 22px; font-weight: 600; margin-bottom: 8px; color: #1D1D1F;">
          Reset your password
        </h2>
        <p style="font-size: 15px; color: #6E6E73; line-height: 1.6; margin-bottom: 20px;">
          We received a request to reset the password for your Tracklet account. Enter this verification code to complete the process:
        </p>
        <div style="background: #F5F5F7; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; text-align: center;">
          <p style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #1D1D1F; margin: 0;">${otp}</p>
        </div>
        <p style="font-size: 14px; color: #86868B;">
          This code will expire in 10 minutes. If you didn't request a password reset, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #E8E8ED; margin: 32px 0 16px;" />
        <p style="font-size: 12px; color: #86868B; text-align: center;">
          © 2026 Tracklet. On Your Terms.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`📧 OTP Email sent to ${userEmail} for password reset.`);
}

module.exports = {
  sendPriceDropAlert,
  sendPasswordResetOTP,
};
