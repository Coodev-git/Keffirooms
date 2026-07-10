import crypto from 'crypto';
import { query } from '../db/pool.js';
import { config } from '../config/index.js';
import { hashToken } from '../utils/tokens.js';
import { AppError } from '../utils/errors.js';
import { sendAdminOtpEmail } from './emailService.js';
import { issueTokensForUser, fetchUserWithAgent } from './authService.js';

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function requestAdminOtp(email) {
  const normalized = email.trim().toLowerCase();
  const { rows } = await query(
    `SELECT id, email, role FROM users WHERE LOWER(email) = $1 AND role = 'admin' AND is_active = TRUE`,
    [normalized]
  );

  // Always return same message to avoid email enumeration
  const generic = { message: 'If this email is registered as admin, a verification code has been sent.' };

  if (!rows[0]) {
    return generic;
  }

  const user = rows[0];

  // Rate limit: max 1 active OTP per 60 seconds
  const recent = await query(
    `SELECT id FROM otp_codes
     WHERE user_id = $1 AND purpose = 'admin_login' AND used_at IS NULL
       AND created_at > NOW() - INTERVAL '60 seconds'`,
    [user.id]
  );
  if (recent.rows.length) {
    throw new AppError('Please wait a minute before requesting another code', 429, 'OTP_RATE_LIMIT');
  }

  const code = generateOtpCode();
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + config.otp.expiresMinutes * 60 * 1000);

  await query(
    `UPDATE otp_codes SET used_at = NOW()
     WHERE user_id = $1 AND purpose = 'admin_login' AND used_at IS NULL`,
    [user.id]
  );

  await query(
    `INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, 'admin_login', $3)`,
    [user.id, codeHash, expiresAt]
  );

  const deliverTo = user.email;
  await sendAdminOtpEmail(deliverTo, code);

  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, metadata)
     VALUES ($1, 'admin_otp_requested', 'auth', $2)`,
    [user.id, JSON.stringify({ email: deliverTo, delivered: true })]
  );

  return { ...generic, delivered: true, email: deliverTo };
}

export async function verifyAdminOtp(email, code, res) {
  const normalized = email.trim().toLowerCase();
  const cleanCode = String(code).replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    throw new AppError('Enter the 6-digit code from your email', 400, 'INVALID_OTP');
  }

  const { rows: users } = await query(
    `SELECT u.*, ap.status AS agent_status, ap.is_promoted_admin
     FROM users u
     LEFT JOIN agent_profiles ap ON ap.user_id = u.id
     WHERE LOWER(u.email) = $1 AND u.role = 'admin' AND u.is_active = TRUE`,
    [normalized]
  );
  if (!users[0]) {
    throw new AppError('Invalid or expired code', 401, 'INVALID_OTP');
  }

  const user = users[0];
  const codeHash = hashToken(cleanCode);

  const { rows: otps } = await query(
    `SELECT * FROM otp_codes
     WHERE user_id = $1 AND purpose = 'admin_login' AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );

  if (!otps[0]) {
    throw new AppError('Code expired or not found. Request a new one.', 401, 'OTP_EXPIRED');
  }

  const otp = otps[0];
  if (otp.attempts >= config.otp.maxAttempts) {
    await query('UPDATE otp_codes SET used_at = NOW() WHERE id = $1', [otp.id]);
    throw new AppError('Too many attempts. Request a new code.', 401, 'OTP_LOCKED');
  }

  if (otp.code_hash !== codeHash) {
    await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    throw new AppError('Incorrect code. Try again.', 401, 'INVALID_OTP');
  }

  await query('UPDATE otp_codes SET used_at = NOW() WHERE id = $1', [otp.id]);

  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, metadata)
     VALUES ($1, 'admin_otp_verified', 'auth', '{}')`,
    [user.id]
  );

  const full = await fetchUserWithAgent(user.id);
  return issueTokensForUser(res, full);
}
