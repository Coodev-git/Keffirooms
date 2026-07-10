import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isProd ? 300 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many authentication attempts.' },
});

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isProd ? 8 : 30,
  message: { error: 'Too many OTP requests. Try again later.' },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'Upload limit exceeded.' },
});
