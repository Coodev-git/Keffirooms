import nodemailer from 'nodemailer';
import { config, isSmtpConfigured } from '../config/index.js';
import { AppError } from '../utils/errors.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!isSmtpConfigured()) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host || 'smtp.gmail.com',
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
    requireTLS: config.smtp.port === 587,
    tls: { minVersion: 'TLSv1.2' },
  });
  return transporter;
}

export async function sendAdminOtpEmail(to, code) {
  const subject = `${code} — KeffiRooms Admin Login Code`;
  const text = [
    'KeffiRooms Admin Login',
    '',
    `Your one-time verification code is: ${code}`,
    '',
    `This code expires in ${config.otp.expiresMinutes} minutes.`,
    'If you did not request this, ignore this email.',
    '',
    '— KeffiRooms Security',
  ].join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#0D9488;margin:0 0 8px;">KeffiRooms Admin</h2>
      <p style="color:#555;font-size:14px;">Your one-time login code:</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#111;padding:16px 0;">${code}</div>
      <p style="color:#888;font-size:13px;">Expires in ${config.otp.expiresMinutes} minutes. Do not share this code.</p>
    </div>`;

  const mail = getTransporter();
  if (!mail) {
    throw new AppError(
      'Email is not configured. Set SMTP_PASS in server/.env to a Gmail App Password for keffirooms@gmail.com',
      503,
      'SMTP_NOT_CONFIGURED'
    );
  }

  try {
    await mail.sendMail({
      from: `KeffiRooms <${config.smtp.from}>`,
      to,
      subject,
      text,
      html,
    });
    return { delivered: true };
  } catch (err) {
    console.error('[ADMIN OTP] Email send failed:', err.message);
    throw new AppError(
      'Could not send verification email. Check SMTP_PASS (Gmail App Password) in server/.env',
      503,
      'SMTP_SEND_FAILED'
    );
  }
}

/** OTP-only reset email — same delivery path as admin login codes */
export async function sendPasswordResetOtpEmail(to, code, accountLabel = 'account') {
  const subject = `${code} — KeffiRooms password reset`;
  const text = [
    'KeffiRooms Password Reset',
    '',
    `Your ${accountLabel} reset code is: ${code}`,
    '',
    `This code expires in ${config.otp.expiresMinutes} minutes.`,
    'Enter it on the KeffiRooms reset password page.',
    '',
    'If you did not request this, ignore this email.',
    '',
    '— KeffiRooms Security',
  ].join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#0D9488;margin:0 0 8px;">Password Reset</h2>
      <p style="color:#555;font-size:14px;">Your ${accountLabel} reset code:</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#111;padding:16px 0;">${code}</div>
      <p style="color:#888;font-size:13px;">Expires in ${config.otp.expiresMinutes} minutes. Do not share this code.</p>
    </div>`;

  return sendMail({ to, subject, text, html, logTag: 'PASSWORD RESET OTP' });
}

async function sendMail({ to, subject, text, html, logTag }) {
  const mail = getTransporter();
  if (!mail) {
    throw new AppError(
      'Email is not configured. Set SMTP_PASS in server/.env to a Gmail App Password.',
      503,
      'SMTP_NOT_CONFIGURED'
    );
  }

  try {
    await mail.sendMail({
      from: `KeffiRooms <${config.smtp.from}>`,
      to,
      subject,
      text,
      html,
    });
    return { delivered: true };
  } catch (err) {
    console.error(`[${logTag}] Email send failed:`, err.message);
    throw new AppError(
      'Could not send reset email. Check SMTP settings and try again.',
      503,
      'SMTP_SEND_FAILED'
    );
  }
}
