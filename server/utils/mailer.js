const nodemailer = require('nodemailer');

// Works with any SMTP provider (Gmail app password, Brevo, Resend SMTP,
// Mailgun, ...). Configure it with the SMTP_* variables in .env.
const isConfigured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter;
const getTransporter = () => {
  if (!transporter) {
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

exports.sendPasswordResetEmail = async ({ to, name, resetUrl, minutes }) => {
  if (!isConfigured()) {
    // Local dev convenience: no SMTP set up, so print the link to the
    // terminal. Never done in production (the link is a credential).
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[mailer] SMTP not configured. Password reset link for ${to}:\n${resetUrl}`);
    } else {
      console.error('[mailer] SMTP_HOST / SMTP_USER / SMTP_PASS are not set - password reset email NOT sent.');
    }
    return;
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await getTransporter().sendMail({
    from,
    to,
    subject: 'Reset your StackPilot password',
    text:
      `Hi ${name || 'there'},\n\n` +
      `We got a request to reset your StackPilot password. Open this link to choose a new one (valid for ${minutes} minutes):\n\n` +
      `${resetUrl}\n\n` +
      `If you didn't ask for this, you can ignore this email - your password won't change.`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;line-height:1.5">` +
      `<h2>Reset your password</h2>` +
      `<p>Hi ${escapeHtml(name || 'there')},</p>` +
      `<p>We got a request to reset your StackPilot password. This link is valid for ${minutes} minutes.</p>` +
      `<p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#a3d12a;color:#111;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Choose a new password</a></p>` +
      `<p style="color:#666;font-size:13px">Or paste this into your browser:<br>${escapeHtml(resetUrl)}</p>` +
      `<p style="color:#666;font-size:13px">If you didn't ask for this, ignore this email - your password won't change.</p>` +
      `</div>`
  });
};
