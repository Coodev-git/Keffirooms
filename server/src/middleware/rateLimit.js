import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

const CRAWLER_UA = /Googlebot|Google-InspectionTool|bingbot|Applebot|DuckDuckBot|Slurp|Baiduspider|YandexBot|facebookexternalhit|Twitterbot|LinkedInBot/i;

function isSeoPath(path) {
  return path === '/robots.txt'
    || path === '/sitemap.xml'
    || path === '/favicon.svg'
    || path === '/favicon.ico'
    || /^\/google[a-f0-9]+\.html$/i.test(path);
}

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isProd ? 300 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip(req) {
    // Never throttle SEO / verification endpoints or major crawlers
    if (isSeoPath(req.path)) return true;
    const ua = req.get('user-agent') || '';
    return CRAWLER_UA.test(ua);
  },
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
