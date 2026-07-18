import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (!v && process.env.NODE_ENV === 'production') {
    console.warn(`Warning: ${name} is not set`);
  }
  return v;
}

const defaultAppUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';

function resolvePublicUrl(name, fallback = defaultAppUrl) {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  // Ignore localhost URLs pasted from local .env when Render provides the live URL
  if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value)) {
      return process.env.RENDER_EXTERNAL_URL;
    }
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  appUrl: resolvePublicUrl('APP_URL'),
  clientUrl: resolvePublicUrl('CLIENT_URL'),
  databaseUrl: required('DATABASE_URL', 'postgresql://keffirooms:keffirooms@localhost:5432/keffirooms'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-in-production-32chars'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production-32chars'),
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || `${defaultAppUrl}/api/auth/google/callback`,
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'keffirooms@gmail.com',
    password: process.env.ADMIN_PASSWORD || 'ChangeThisSecurePassword123!',
    name: process.env.ADMIN_NAME || 'KeffiRooms Admin',
    phone: process.env.ADMIN_PHONE || '07066068160',
  },
  platform: {
    wa: process.env.ADMIN_WA || '2347066068160',
    phone: process.env.ADMIN_PHONE_DISPLAY || '07066068160',
    fees: {
      agent: parseInt(process.env.FEE_AGENT_NGN || '5000', 10),
      seeker: parseInt(process.env.FEE_SEEKER_NGN || '2000', 10),
      totalPerConnection: parseInt(
        process.env.FEE_TOTAL_NGN || String(
          parseInt(process.env.FEE_AGENT_NGN || '5000', 10)
          + parseInt(process.env.FEE_SEEKER_NGN || '2000', 10)
        ),
        10
      ),
    },
  },
  upload: {
    dir: path.resolve(__dirname, '../../uploads'),
    maxBytes: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10) * 1024 * 1024,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    listingFolder: process.env.CLOUDINARY_LISTING_FOLDER || 'keffirooms/listings',
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || process.env.ADMIN_EMAIL || 'keffirooms@gmail.com',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || process.env.ADMIN_EMAIL || 'keffirooms@gmail.com',
  },
  otp: {
    expiresMinutes: parseInt(process.env.OTP_EXPIRES_MINUTES || '10', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
  },
  isProd: process.env.NODE_ENV === 'production',
};

const SMTP_PASS_PLACEHOLDERS = new Set([
  '',
  'your-16-char-gmail-app-password',
  'your-gmail-app-password',
  'changeme',
]);

export function isSmtpConfigured() {
  const { smtp } = config;
  return !!(
    smtp.user
    && smtp.pass
    && !SMTP_PASS_PLACEHOLDERS.has(smtp.pass.trim())
  );
}

export function isCloudinaryConfigured() {
  const { cloudinary } = config;
  return !!(
    cloudinary.cloudName
    && cloudinary.apiKey
    && cloudinary.apiSecret
  );
}

const GOOGLE_CLIENT_PLACEHOLDERS = new Set([
  '',
  'your-id.apps.googleusercontent.com',
  'your-client-id.apps.googleusercontent.com',
  'your-client-id',
  'your-secret',
]);

export function isGoogleConfigured() {
  const id = (config.google.clientId || '').trim();
  return !!id && !GOOGLE_CLIENT_PLACEHOLDERS.has(id);
}

export function isGoogleRedirectConfigured() {
  return !!(config.google.clientId && config.google.clientSecret);
}

export function isGoogleDevLoginEnabled() {
  if (config.isProd || isGoogleConfigured()) return false;
  return process.env.GOOGLE_DEV_LOGIN !== 'false';
}
