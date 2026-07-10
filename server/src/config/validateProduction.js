import { config, isCloudinaryConfigured, isGoogleConfigured, isSmtpConfigured } from './index.js';

const JWT_WEAK_SECRETS = new Set([
  '',
  'change-me-access-secret-min-32-chars',
  'change-me-refresh-secret-min-32-chars',
  'dev-access-secret-change-in-production-32chars',
  'dev-refresh-secret-change-in-production-32chars',
]);

const ADMIN_PASSWORD_WEAK = new Set([
  '',
  'ChangeThisSecurePassword123!',
  'changeme',
  'password',
  'admin123',
]);

function isWeakJwt(secret) {
  if (!secret || secret.length < 32) return true;
  return JWT_WEAK_SECRETS.has(secret.trim());
}

function isLocalDatabaseUrl(url) {
  return /localhost|127\.0\.0\.1/.test(url || '');
}

function isHttpsUrl(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Returns { ok: true } or { ok: false, errors: string[] }
 */
export function getProductionReadiness() {
  const errors = [];
  const warnings = [];

  if (!config.isProd) {
    return { ok: true, errors, warnings, mode: 'development' };
  }

  if (isWeakJwt(config.jwt.accessSecret)) {
    errors.push('JWT_ACCESS_SECRET must be a strong random string (openssl rand -base64 48)');
  }
  if (isWeakJwt(config.jwt.refreshSecret)) {
    errors.push('JWT_REFRESH_SECRET must be a strong random string (openssl rand -base64 48)');
  }
  if (config.jwt.accessSecret === config.jwt.refreshSecret) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }

  if (!config.databaseUrl) {
    errors.push('DATABASE_URL is required');
  } else if (isLocalDatabaseUrl(config.databaseUrl)) {
    errors.push('DATABASE_URL must point to a hosted database in production (not localhost)');
  } else if (!config.databaseUrl.includes('sslmode=') && !config.databaseUrl.includes('ssl=true')) {
    warnings.push('DATABASE_URL should include sslmode=require for hosted Postgres (Neon, etc.)');
  }

  if (!isHttpsUrl(config.appUrl)) {
    errors.push('APP_URL must be https://your-domain.com in production');
  }
  if (!isHttpsUrl(config.clientUrl)) {
    errors.push('CLIENT_URL must be https://your-domain.com in production');
  }

  if (ADMIN_PASSWORD_WEAK.has(config.admin.password)) {
    errors.push('ADMIN_PASSWORD must be changed from the default — use a strong unique password');
  }

  if (!isSmtpConfigured()) {
    errors.push('SMTP_PASS is required — admin OTP and password reset emails will not send');
  }

  if (!isCloudinaryConfigured()) {
    errors.push('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required for listing photos');
  }

  if (!isGoogleConfigured()) {
    warnings.push('GOOGLE_CLIENT_ID is not set — “Continue with Google” will be disabled (email/password still works)');
  } else if (!config.google.clientSecret) {
    warnings.push('GOOGLE_CLIENT_SECRET is empty — redirect OAuth fallback disabled (popup sign-in may still work)');
  }

  if (config.google.callbackUrl && !config.google.callbackUrl.startsWith(config.clientUrl)) {
    warnings.push(`GOOGLE_CALLBACK_URL should start with CLIENT_URL (${config.clientUrl})`);
  }

  if (process.env.GOOGLE_DEV_LOGIN === 'true') {
    errors.push('GOOGLE_DEV_LOGIN must not be true in production');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    mode: 'production',
  };
}

export function assertProductionReady() {
  const result = getProductionReadiness();
  if (result.ok) return result;

  console.error('\n❌ PRODUCTION CONFIGURATION INVALID — server will not start.\n');
  result.errors.forEach((e) => console.error(`   • ${e}`));
  if (result.warnings.length) {
    console.error('\nWarnings:');
    result.warnings.forEach((w) => console.error(`   • ${w}`));
  }
  console.error('\nCopy server/.env.production.example → set secrets on your host → redeploy.\n');
  process.exit(1);
}
