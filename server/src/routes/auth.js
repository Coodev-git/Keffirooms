import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  loginHandler,
  registerSeekerHandler,
  registerAgentHandler,
  registerHotelHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPassword,
  googleStartHandler,
  googleCallbackHandler,
  googleIdTokenHandler,
  googleDevLoginHandler,
} from '../services/authService.js';
import { requestAdminOtp, verifyAdminOtp } from '../services/adminOtpService.js';
import { asyncHandler } from '../middleware/auth.js';
import { otpLimiter } from '../middleware/rateLimit.js';

const router = Router();

function normalizeEmailInput(email) {
  return String(email || '').trim().toLowerCase();
}

router.post(
  '/login',
  authLimiter,
  body('identifier').trim().notEmpty(),
  body('password').notEmpty(),
  validate,
  asyncHandler(loginHandler)
);

router.post(
  '/register/seeker',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('phone').optional().trim(),
  validate,
  asyncHandler(registerSeekerHandler)
);

router.post(
  '/register/agent',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('phone').trim().notEmpty().custom((value) => {
    const d = String(value).replace(/\D/g, '');
    if (!/^0[789]\d{9}$/.test(d) && !/^234[789]\d{9}$/.test(d)) {
      throw new Error('Use your active WhatsApp number (e.g. 08012345678)');
    }
    return true;
  }),
  body('recoveryPhone').optional({ values: 'falsy' }).trim().custom((value) => {
    if (!value) return true;
    const d = String(value).replace(/\D/g, '');
    if (!/^0[789]\d{9}$/.test(d) && !/^234[789]\d{9}$/.test(d)) {
      throw new Error('Recovery phone must be a valid mobile number (e.g. 08012345678)');
    }
    return true;
  }),
  validate,
  asyncHandler(registerAgentHandler)
);

router.post(
  '/register/hotel',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('phone').trim().notEmpty(),
  body('hotelName').trim().isLength({ min: 2, max: 200 }),
  body('locationAddress').optional({ values: 'falsy' }).trim(),
  body('area').trim().isLength({ min: 2, max: 100 }),
  body('landmark').optional({ values: 'falsy' }).trim(),
  body('description').optional({ values: 'falsy' }).trim(),
  body('priceRangeMin').isInt({ min: 0 }),
  body('priceRangeMax').isInt({ min: 0 }),
  body('pinLat').isFloat({ min: -90, max: 90 }),
  body('pinLng').isFloat({ min: -180, max: 180 }),
  body('pinAcc').optional({ values: 'falsy' }).trim(),
  body('backupPhone').optional({ values: 'falsy' }).trim(),
  validate,
  asyncHandler(registerHotelHandler)
);

router.post('/refresh', authLimiter, asyncHandler(refreshHandler));
router.post('/logout', asyncHandler(logoutHandler));
router.get('/me', authenticate, asyncHandler(meHandler));

router.post(
  '/forgot-password',
  authLimiter,
  body('identifier').optional().trim(),
  body('email').optional().trim(),
  body('role').optional().isIn(['agent', 'seeker']),
  validate,
  asyncHandler(async (req, res) => {
    const raw = normalizeEmailInput(req.body.email || req.body.identifier);
    if (!raw || !raw.includes('@')) {
      return res.status(400).json({ error: 'Enter your registration email address', code: 'VALIDATION_ERROR' });
    }
    const result = await requestPasswordReset(raw, req.body.role || null);
    res.json(result);
  })
);

router.post(
  '/verify-reset-otp',
  otpLimiter,
  body('identifier').optional().trim(),
  body('email').optional().trim(),
  body('role').optional().isIn(['agent', 'seeker']),
  body('code').trim().notEmpty(),
  validate,
  asyncHandler(async (req, res) => {
    const raw = normalizeEmailInput(req.body.email || req.body.identifier);
    if (!raw || !raw.includes('@')) {
      return res.status(400).json({ error: 'Enter your registration email address', code: 'VALIDATION_ERROR' });
    }
    const result = await verifyPasswordResetOtp(raw, req.body.code, req.body.role || null);
    res.json(result);
  })
);

router.post(
  '/reset-password',
  authLimiter,
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
  validate,
  asyncHandler(async (req, res) => {
    const result = await resetPassword(req.body.token, req.body.password);
    res.json(result);
  })
);

router.post(
  '/google/token',
  authLimiter,
  body('credential').notEmpty(),
  body('role').optional().isIn(['seeker', 'agent']),
  validate,
  asyncHandler(googleIdTokenHandler)
);

router.post(
  '/google/dev',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('name').optional().trim().isLength({ min: 1, max: 120 }),
  validate,
  asyncHandler(googleDevLoginHandler)
);

router.get('/google', googleStartHandler);
router.get('/google/callback', asyncHandler(googleCallbackHandler));

router.post(
  '/admin/request-otp',
  otpLimiter,
  body('email').isEmail().normalizeEmail(),
  validate,
  asyncHandler(async (req, res) => {
    const result = await requestAdminOtp(req.body.email);
    res.json(result);
  })
);

router.post(
  '/admin/verify-otp',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('code').trim().isLength({ min: 6, max: 6 }),
  validate,
  asyncHandler(async (req, res) => {
    const tokens = await verifyAdminOtp(req.body.email, req.body.code, res);
    res.json(tokens);
  })
);

export default router;
