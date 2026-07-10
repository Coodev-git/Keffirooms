#!/usr/bin/env node
/**
 * Verify password-reset OTP email delivery.
 * Usage: npm run test:reset-email -- you@email.com
 */
import { config, isSmtpConfigured } from '../src/config/index.js';
import { sendPasswordResetOtpEmail } from '../src/services/emailService.js';

const to = process.argv[2] || config.admin.email;

if (!isSmtpConfigured()) {
  console.error('\nSMTP is not configured. Set SMTP_PASS in server/.env\n');
  process.exit(1);
}

const code = '654321';
console.log(`Sending test password-reset OTP to ${to}...`);

try {
  await sendPasswordResetOtpEmail(to, code, 'test account');
  console.log('Success — check inbox and spam folder.');
} catch (err) {
  console.error('Failed:', err.message);
  process.exit(1);
}
