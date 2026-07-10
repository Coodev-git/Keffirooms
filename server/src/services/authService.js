import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, withTransaction } from '../db/pool.js';
import { config, isGoogleConfigured, isGoogleDevLoginEnabled } from '../config/index.js';
import {
  signAccessToken,
  signRefreshToken,
  hashToken,
  parseDuration,
  sanitizeUser,
} from '../utils/tokens.js';
import { AppError } from '../utils/errors.js';
import { isNigerianWhatsAppPhone, normalizeNigerianPhone } from '../utils/phone.js';
import { sendPasswordResetOtpEmail } from './emailService.js';

const REFRESH_COOKIE = 'kr_refresh';

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: parseDuration(config.jwt.refreshExpires),
    path: '/api/auth',
  };
}

export async function fetchUserWithAgent(userId) {
  const { rows } = await query(
    `SELECT u.*, ap.status AS agent_status, ap.is_promoted_admin
     FROM users u
     LEFT JOIN agent_profiles ap ON ap.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0] || null;
}

export async function issueTokensForUser(res, userRow) {
  const payload = { sub: userRow.id, role: userRow.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseDuration(config.jwt.refreshExpires));

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userRow.id, tokenHash, expiresAt]
  );

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  return {
    accessToken,
    user: sanitizeUser(userRow),
  };
}

export async function registerSeeker({ email, password, name, phone }) {
  const existing = await query(
    'SELECT id FROM users WHERE email = $1 OR ($2::text IS NOT NULL AND phone = $2)',
    [email.toLowerCase(), phone || null]
  );
  if (existing.rows.length) throw new AppError('Email or phone already registered', 409, 'DUPLICATE');

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    `INSERT INTO users (email, phone, password_hash, role, name, email_verified)
     VALUES ($1, $2, $3, 'seeker', $4, FALSE)
     RETURNING *`,
    [email.toLowerCase(), phone || null, hash, name]
  );
  return rows[0];
}

export async function registerAgent({ email, password, name, phone, recoveryPhone }) {
  if (!isNigerianWhatsAppPhone(phone)) {
    throw new AppError(
      'Register with your active WhatsApp number (e.g. 08012345678). Landlines and invalid numbers are not accepted.',
      400,
      'INVALID_WHATSAPP_PHONE'
    );
  }
  const normalizedPhone = normalizeNigerianPhone(phone);
  let normalizedRecovery = null;
  if (recoveryPhone) {
    if (!isNigerianWhatsAppPhone(recoveryPhone)) {
      throw new AppError('Recovery phone must be a valid Nigerian mobile number (e.g. 08012345678)', 400, 'INVALID_RECOVERY_PHONE');
    }
    normalizedRecovery = normalizeNigerianPhone(recoveryPhone);
    if (normalizedRecovery === normalizedPhone) {
      throw new AppError('Recovery phone must be different from your WhatsApp number', 400, 'DUPLICATE_PHONE');
    }
  }

  const existing = await query(
    `SELECT id FROM users
     WHERE email = $1 OR phone = $2 OR ($3::text IS NOT NULL AND recovery_phone = $3)`,
    [email.toLowerCase(), normalizedPhone, normalizedRecovery]
  );
  if (existing.rows.length) throw new AppError('Email or phone already registered', 409, 'DUPLICATE');

  return withTransaction(async (client) => {
    const hash = await bcrypt.hash(password, 12);
    const userRes = await client.query(
      `INSERT INTO users (email, phone, recovery_phone, password_hash, role, name)
       VALUES ($1, $2, $3, $4, 'agent', $5)
       RETURNING *`,
      [email.toLowerCase(), normalizedPhone, normalizedRecovery, hash, name]
    );
    await client.query(
      `INSERT INTO agent_profiles (user_id, status, business_name)
       VALUES ($1, 'pending', $2)`,
      [userRes.rows[0].id, name]
    );
    const user = await fetchUserWithAgent(userRes.rows[0].id);
    return user;
  });
}

export async function loginWithPassword({ identifier, password }) {
  const trimmed = identifier.trim();
  const emailId = trimmed.toLowerCase();
  const normalizedPhone = normalizeNigerianPhone(trimmed);
  const { rows } = await query(
    `SELECT u.*, ap.status AS agent_status, ap.is_promoted_admin
     FROM users u
     LEFT JOIN agent_profiles ap ON ap.user_id = u.id
     WHERE u.is_active = TRUE AND (
       LOWER(u.email) = $1
       OR ($2::text IS NOT NULL AND (u.phone = $2 OR u.recovery_phone = $2))
     )`,
    [emailId, normalizedPhone]
  );

  const user = rows[0];
  if (!user || !user.password_hash) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  if (user.role === 'agent' && user.agent_status === 'denied') {
    throw new AppError('Agent access denied by admin', 403, 'AGENT_DENIED');
  }

  return user;
}

export async function loginHandler(req, res) {
  const user = await loginWithPassword(req.body);
  if (user.role === 'agent' && user.agent_status === 'pending') {
    throw new AppError('Awaiting admin approval', 403, 'AGENT_PENDING');
  }
  const tokens = await issueTokensForUser(res, user);
  res.json(tokens);
}

export async function registerSeekerHandler(req, res) {
  const user = await registerSeeker(req.body);
  const full = await fetchUserWithAgent(user.id);
  const tokens = await issueTokensForUser(res, full);
  res.status(201).json(tokens);
}

export async function registerAgentHandler(req, res) {
  const user = await registerAgent(req.body);
  res.status(201).json({
    message: 'Request submitted — awaiting admin approval',
    user: sanitizeUser(user),
  });
}

export async function refreshHandler(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new AppError('Refresh token missing', 401, 'NO_REFRESH');

  const { verifyRefreshToken } = await import('../utils/tokens.js');
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH');
  }

  const tokenHash = hashToken(token);
  const { rows } = await query(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
    [tokenHash, decoded.sub]
  );
  if (!rows[0]) throw new AppError('Refresh token revoked or expired', 401, 'INVALID_REFRESH');

  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [rows[0].id]);

  const user = await fetchUserWithAgent(decoded.sub);
  if (!user) throw new AppError('User not found', 401, 'INVALID_REFRESH');

  const tokens = await issueTokensForUser(res, user);
  res.json(tokens);
}

export async function logoutHandler(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    await query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
      [hashToken(token)]
    );
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({ message: 'Logged out' });
}

export async function meHandler(req, res) {
  const user = await fetchUserWithAgent(req.user.id);
  res.json({ user: sanitizeUser(user) });
}

function normalizeEmailInput(email) {
  return String(email || '').trim().toLowerCase();
}

function accountLabelForRole(role) {
  if (role === 'agent') return 'agent';
  if (role === 'seeker') return 'student';
  return 'account';
}

export async function requestPasswordReset(identifier, expectedRole = null) {
  const generic = {
    message: 'If that account exists, a reset code has been sent to your email.',
    channel: 'email',
  };

  const user = await findUserByEmail(identifier);
  if (!user) {
    return generic;
  }

  if (!user.email) {
    throw new AppError('No email on file for this account. Contact KeffiRooms support.', 400, 'NO_EMAIL');
  }

  if (expectedRole && user.role !== expectedRole) {
    const msg = expectedRole === 'agent'
      ? 'This email is not registered as an agent. Use the student reset page if you are a student.'
      : 'This email is not registered as a student. Use the agent reset page if you are an agent.';
    throw new AppError(msg, 400, 'WRONG_ACCOUNT_TYPE');
  }

  if (!['agent', 'seeker'].includes(user.role)) {
    return generic;
  }

  const recent = await query(
    `SELECT id FROM otp_codes
     WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL
       AND created_at > NOW() - INTERVAL '60 seconds'`,
    [user.id]
  );
  if (recent.rows.length) {
    throw new AppError('Please wait a minute before requesting another code', 429, 'OTP_RATE_LIMIT');
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashToken(code);
  const otpExpiresAt = new Date(Date.now() + config.otp.expiresMinutes * 60 * 1000);

  await query(
    `UPDATE otp_codes SET used_at = NOW()
     WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL`,
    [user.id]
  );
  await query(
    `INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at) VALUES ($1, $2, 'password_reset', $3)`,
    [user.id, codeHash, otpExpiresAt]
  );

  await sendPasswordResetOtpEmail(
    user.email,
    code,
    accountLabelForRole(user.role)
  );

  return {
    ...generic,
    delivered: true,
    emailDelivered: true,
    identifier: user.email,
    role: user.role,
  };
}

async function findUserByEmail(email) {
  const trimmed = normalizeEmailInput(email);
  if (!trimmed || !trimmed.includes('@')) return null;
  const { rows } = await query(
    `SELECT id, email, phone, recovery_phone, name, role
     FROM users WHERE LOWER(email) = $1 AND is_active = TRUE`,
    [trimmed]
  );
  return rows[0] || null;
}

function buildPasswordResetPageUrl(user, token) {
  const params = new URLSearchParams();
  if (user.role === 'agent' || user.role === 'seeker') {
    params.set('role', user.role === 'agent' ? 'agent' : 'seeker');
  }
  params.set('token', token);
  return `${config.clientUrl}/reset-password.html?${params}`;
}

export async function verifyPasswordResetOtp(identifier, code, expectedRole = null) {
  const user = await findUserByEmail(identifier);
  if (!user) throw new AppError('Invalid or expired code', 400, 'INVALID_OTP');

  if (expectedRole && user.role !== expectedRole) {
    throw new AppError('Invalid or expired code', 400, 'INVALID_OTP');
  }

  const cleanCode = String(code).replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    throw new AppError('Enter the 6-digit code from your email', 400, 'INVALID_OTP');
  }

  const { rows: otps } = await query(
    `SELECT * FROM otp_codes
     WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  const otp = otps[0];
  if (!otp) throw new AppError('Invalid or expired code', 400, 'INVALID_OTP');

  if (otp.attempts >= config.otp.maxAttempts) {
    await query('UPDATE otp_codes SET used_at = NOW() WHERE id = $1', [otp.id]);
    throw new AppError('Too many attempts. Request a new code.', 401, 'OTP_LOCKED');
  }

  const codeHash = hashToken(cleanCode);
  if (otp.code_hash !== codeHash) {
    await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    throw new AppError('Invalid or expired code', 400, 'INVALID_OTP');
  }

  await query('UPDATE otp_codes SET used_at = NOW() WHERE id = $1', [otp.id]);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, tokenHash, expiresAt]
  );

  return { resetToken: rawToken, message: 'Code verified — choose a new password' };
}

export async function resetPassword(token, newPassword) {
  const tokenHash = hashToken(token);
  const { rows } = await query(
    `SELECT prt.*, u.id AS uid FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token_hash = $1 AND prt.used_at IS NULL AND prt.expires_at > NOW()`,
    [tokenHash]
  );
  if (!rows[0]) throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
    hash,
    rows[0].uid,
  ]);
  await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [rows[0].id]);
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1', [rows[0].uid]);

  return { message: 'Password updated successfully' };
}

async function upsertGoogleUser(profile, role = 'seeker') {
  const googleId = profile.id || profile.sub;
  const email = profile.email?.toLowerCase();
  if (!googleId || !email) {
    throw new AppError('Google profile missing email', 400, 'OAUTH_ERROR');
  }

  let user = await query(
    `SELECT u.*, ap.status AS agent_status, ap.is_promoted_admin
     FROM users u LEFT JOIN agent_profiles ap ON ap.user_id = u.id
     WHERE u.google_id = $1 OR LOWER(u.email) = $2`,
    [googleId, email]
  ).then((r) => r.rows[0]);

  if (!user) {
    const inserted = await query(
      `INSERT INTO users (email, google_id, role, name, avatar_url, email_verified)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING *`,
      [email, googleId, role, profile.name || 'Student', profile.picture || null]
    );
    user = inserted.rows[0];
    if (role === 'agent') {
      await query(
        `INSERT INTO agent_profiles (user_id, status) VALUES ($1, 'pending')`,
        [user.id]
      );
      user = await fetchUserWithAgent(user.id);
      return { user, isNewAgent: true };
    }
    user = await fetchUserWithAgent(user.id);
    return { user, isNewAgent: false };
  }

  if (!user.google_id) {
    await query('UPDATE users SET google_id = $1, email_verified = TRUE WHERE id = $2', [
      googleId,
      user.id,
    ]);
    user = await fetchUserWithAgent(user.id);
  }

  return { user, isNewAgent: false };
}

export async function googleIdTokenHandler(req, res) {
  const { credential, role = 'seeker' } = req.body;
  if (!credential) throw new AppError('Missing Google credential', 400, 'VALIDATION_ERROR');
  if (!config.google.clientId) {
    throw new AppError('Google sign-in not configured. Set GOOGLE_CLIENT_ID in server/.env', 503, 'OAUTH_NOT_CONFIGURED');
  }

  const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  const payload = await verifyRes.json();
  if (!verifyRes.ok || payload.aud !== config.google.clientId || !payload.email) {
    throw new AppError('Invalid Google sign-in token', 401, 'OAUTH_ERROR');
  }

  const { user, isNewAgent } = await upsertGoogleUser(
    {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    },
    role
  );

  if (isNewAgent) {
    return res.json({
      registered: true,
      message: 'Agent request submitted. Await admin approval.',
      user: sanitizeUser(user),
    });
  }

  const tokens = await issueTokensForUser(res, user);
  res.json(tokens);
}

export async function googleDevLoginHandler(req, res) {
  if (!isGoogleDevLoginEnabled()) {
    throw new AppError('Google sign-in not configured', 503, 'OAUTH_NOT_CONFIGURED');
  }

  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim() || email.split('@')[0] || 'Student';
  if (!email || !email.includes('@')) {
    throw new AppError('Enter a valid Google email address', 400, 'VALIDATION_ERROR');
  }

  const { user } = await upsertGoogleUser(
    { sub: `dev_${email}`, email, name },
    'seeker'
  );

  if (user.role !== 'seeker') {
    throw new AppError('This account is not a student account', 403, 'FORBIDDEN');
  }

  const tokens = await issueTokensForUser(res, user);
  res.json(tokens);
}

export async function googleCallbackHandler(req, res) {
  const { code, state } = req.query;
  if (!code) throw new AppError('Google auth failed', 400, 'OAUTH_ERROR');

  let role = 'seeker';
  try {
    const parsed = JSON.parse(Buffer.from(state || '', 'base64url').toString() || '{}');
    if (parsed.role) role = parsed.role;
  } catch { /* default seeker */ }

  if (!config.google.clientId || !config.google.clientSecret) {
    throw new AppError('Google OAuth not configured', 503, 'OAUTH_NOT_CONFIGURED');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.callbackUrl,
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new AppError('Google token exchange failed', 400, 'OAUTH_ERROR');

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();
  if (!profile.email) throw new AppError('Google profile missing email', 400, 'OAUTH_ERROR');

  const { user, isNewAgent } = await upsertGoogleUser(profile, role);
  if (isNewAgent) {
    return res.redirect(`${config.clientUrl}/auth-agent.html?registered=1`);
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id, role: user.role });
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, hashToken(refreshToken), new Date(Date.now() + parseDuration(config.jwt.refreshExpires))]
  );
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  const redirectMap = { seeker: 'seeker.html', agent: 'agent.html', admin: 'admin.html' };
  res.redirect(`${config.clientUrl}/auth-callback.html?token=${accessToken}&role=${user.role}&redirect=${redirectMap[user.role] || 'seeker.html'}`);
}

export function googleStartHandler(req, res, next) {
  if (!config.google.clientId || !config.google.clientSecret) {
    return next(new AppError(
      'Google redirect sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env',
      503,
      'OAUTH_NOT_CONFIGURED'
    ));
  }
  const role = req.query.role || 'seeker';
  const state = Buffer.from(JSON.stringify({ role })).toString('base64url');
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
