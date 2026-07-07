import nodemailer from 'nodemailer';

// Email sender. Configure SMTP in the repo-root .env to send real mail:
//   SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (true|false), SMTP_USER, SMTP_PASS, SMTP_FROM
// If SMTP isn't configured, mail is logged to the console and (in dev) the link is
// returned in the API response so password reset is still testable.
const from = process.env.SMTP_FROM || 'ServisAku <no-reply@servisaku.my>';

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export const isMailerReady = Boolean(transporter);

export async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.log(`\n📧 [DEV email — SMTP not configured]\n  to: ${to}\n  subject: ${subject}\n  ${text || ''}\n`);
    return { delivered: false };
  }
  await transporter.sendMail({ from, to, subject, html, text });
  return { delivered: true };
}
