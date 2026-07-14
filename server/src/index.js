import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config, isSmtpConfigured, isCloudinaryConfigured, isGoogleConfigured, isGoogleDevLoginEnabled } from './config/index.js';
import { assertProductionReady, getProductionReadiness } from './config/validateProduction.js';
import { pool } from './db/pool.js';
import { loadUser } from './middleware/loadUser.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.js';
import listingRoutes from './routes/listings.js';
import adminRoutes from './routes/admin.js';
import socialRoutes from './routes/social.js';
import hotelRoutes from './routes/hotels.js';
import hotelOwnerRoutes from './routes/hotelOwner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, '../../');
const legacyUploadRoot = config.upload.dir;

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin(origin, callback) {
    // Non-browser requests (curl, same-origin)
    if (!origin) return callback(null, true);

    if (config.env !== 'production') {
      // Dev: allow localhost / 127.0.0.1 on any port (Live Server, etc.)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, origin);
      }
    }

    const allowed = [config.clientUrl, config.appUrl];
    if (allowed.includes(origin)) return callback(null, origin);

    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(globalLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(loadUser);

// Legacy local uploads (existing listings) — new uploads use Cloudinary secure_url
app.use('/uploads', express.static(legacyUploadRoot, { maxAge: config.isProd ? '7d' : 0 }));

app.get('/api/health', async (req, res) => {
  let db = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch {
    db = 'disconnected';
  }
  const readiness = getProductionReadiness();
  const ready = db === 'ok' && (config.isProd ? readiness.ok : true);
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    service: 'keffirooms-api',
    env: config.env,
    database: db,
    smtp: isSmtpConfigured() ? 'configured' : 'missing',
    cloudinary: isCloudinaryConfigured() ? 'configured' : 'missing',
    google: isGoogleConfigured() ? 'configured' : (isGoogleDevLoginEnabled() ? 'dev-login' : 'missing'),
    productionReady: readiness.ok,
    productionErrors: readiness.errors,
    productionWarnings: readiness.warnings,
  });
});

assertProductionReady();

app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/hotel-owner', hotelOwnerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', socialRoutes);

app.use(express.static(clientRoot, { index: 'index.html', extensions: ['html'] }));

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, async () => {
  console.log(`KeffiRooms server running at ${config.appUrl}`);
  console.log(`Environment: ${config.env}`);
  console.log(`Open in browser: ${config.appUrl}`);
  try {
    await pool.query('SELECT 1');
    console.log('Database: connected');
  } catch {
    console.error('\n⚠️  DATABASE NOT CONNECTED — login and data will fail.');
    console.error('   macOS (Homebrew): brew services start postgresql@16');
    console.error('   Docker:           docker compose up -d postgres');
    console.error('   Then:             npm run db:migrate && npm run db:seed\n');
  }
  if (!isSmtpConfigured()) {
    console.error('\n⚠️  ADMIN OTP EMAIL NOT CONFIGURED — codes cannot be sent.');
    console.error('   Set SMTP_PASS in server/.env to a Gmail App Password for', config.admin.email);
    console.error('   Create one: https://myaccount.google.com/apppasswords');
    console.error('   Then restart the server and run: npm run test:smtp\n');
  } else {
    console.log(`Admin OTP email: ready (${config.smtp.user})`);
  }
  if (!isCloudinaryConfigured()) {
    console.error('\n⚠️  CLOUDINARY NOT CONFIGURED — listing photo uploads will fail.');
    console.error('   Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in server/.env\n');
  } else {
    console.log(`Cloudinary: ready (${config.cloudinary.cloudName})`);
  }
  if (!isGoogleConfigured()) {
    if (isGoogleDevLoginEnabled()) {
      console.log('Google sign-in: dev email login enabled (set GOOGLE_CLIENT_ID for real OAuth)');
    } else {
      console.error('\n⚠️  GOOGLE SIGN-IN NOT CONFIGURED — “Continue with Google” will not work.');
      console.error('   1. Create OAuth credentials: https://console.cloud.google.com/apis/credentials');
      console.error('   2. Add authorized JavaScript origin: http://localhost:3000');
      console.error('   3. Set GOOGLE_CLIENT_ID in server/.env (and GOOGLE_CLIENT_SECRET for redirect fallback)');
      console.error('   4. Restart the server\n');
    }
  } else {
    console.log(`Google sign-in: ready (client ID set)`);
  }
});
