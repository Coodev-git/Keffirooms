#!/usr/bin/env node
/**
 * Verify Gmail SMTP for admin OTP.
 * Usage: npm run test:smtp
 * Requires SMTP_PASS (Gmail App Password) in server/.env
 */
import { config, isSmtpConfigured } from '../src/config/index.js';
import { sendAdminOtpEmail } from '../src/services/emailService.js';

const to = config.admin.email;

if (!isSmtpConfigured()) {
  console.error('\nSMTP is not configured.');
  console.error('Set SMTP_PASS in server/.env to a Gmail App Password for', config.smtp.user);
  console.error('Create one: https://myaccount.google.com/apppasswords\n');
  process.exit(1);
}

const code = '123456';
console.log(`Sending test OTP email to ${to}...`);

try {
  await sendAdminOtpEmail(to, code);
  console.log('Success — check the inbox at', to);
} catch (err) {
  console.error('Failed:', err.message);
  process.exit(1);
}
