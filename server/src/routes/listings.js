import { Router } from 'express';
import { body, param, query as qv } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { AppError } from '../utils/errors.js';
import { authenticate, requireRole, requireAgentApproved, asyncHandler } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { uploadListingImages } from '../services/cloudinaryService.js';
import {
  listListings,
  getListingById,
  getListingBySerial,
  createListing,
  updateListing,
  getPublicStats,
  getFeaturedListing,
  unlistListing,
  relistListing,
} from '../services/listingService.js';
import { getAgentTrustProfile } from '../services/trustScoreService.js';
import { config, isSmtpConfigured, isGoogleConfigured, isGoogleRedirectConfigured, isGoogleDevLoginEnabled } from '../config/index.js';

function isStaffUser(user) {
  return !!(user && (user.role === 'admin' || user.isPromotedAdmin));
}

const router = Router();

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json(await getPublicStats());
  })
);

router.get(
  '/featured',
  asyncHandler(async (req, res) => {
    res.json({ listing: await getFeaturedListing() });
  })
);

router.get(
  '/',
  qv('area').optional(),
  qv('maxPrice').optional().isInt(),
  qv('verifiedOnly').optional().isBoolean(),
  qv('q').optional(),
  qv('status').optional(),
  validate,
  asyncHandler(async (req, res) => {
    const listings = await listListings({
      area: req.query.area,
      maxPrice: req.query.maxPrice ? parseInt(req.query.maxPrice, 10) : undefined,
      q: req.query.q,
      publicBrowse: true,
      verifiedOnly: req.query.verifiedOnly === 'true',
    });
    res.json({ listings });
  })
);

router.get(
  '/mine',
  authenticate,
  requireRole('agent', 'admin'),
  asyncHandler(async (req, res) => {
    const listings = await listListings({ agentId: req.user.id, includeUnavailable: true });
    let trust = null;
    if (req.user.role === 'agent') {
      trust = await getAgentTrustProfile(req.user.id);
    }
    res.json({ listings, trust });
  })
);

router.get(
  '/mine/trust',
  authenticate,
  requireRole('agent'),
  asyncHandler(async (req, res) => {
    res.json({ trust: await getAgentTrustProfile(req.user.id) });
  })
);

router.patch(
  '/:id/unlist',
  authenticate,
  requireAgentApproved,
  param('id').isUUID(),
  body('notes').optional().trim(),
  validate,
  asyncHandler(async (req, res) => {
    const listing = await unlistListing(
      req.params.id,
      req.user.id,
      req.user.role,
      req.body.notes
    );
    res.json({ listing });
  })
);

router.patch(
  '/:id/relist',
  authenticate,
  requireAgentApproved,
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const listing = await relistListing(req.params.id, req.user.id);
    res.json({ listing });
  })
);

router.patch(
  '/:id',
  authenticate,
  requireAgentApproved,
  param('id').isUUID(),
  body('title').trim().isLength({ min: 3, max: 200 }),
  body('type').trim().notEmpty(),
  body('price').isInt({ min: 1000 }),
  body('area').trim().notEmpty(),
  body('distance').trim().notEmpty(),
  body('description').optional({ values: 'falsy' }).trim(),
  body('landmark').optional({ values: 'falsy' }).trim(),
  body('amenities').optional(),
  validate,
  asyncHandler(async (req, res) => {
    const amenities = typeof req.body.amenities === 'string'
      ? JSON.parse(req.body.amenities)
      : req.body.amenities || [];

    const listing = await updateListing(req.params.id, req.user.id, {
      title: req.body.title,
      type: req.body.type,
      price: parseInt(req.body.price, 10),
      description: req.body.description || null,
      area: req.body.area,
      landmark: req.body.landmark || null,
      distance: req.body.distance,
      amenities,
    });
    res.json({ listing });
  })
);

router.get('/config/platform', (req, res) => {
  res.json({
    adminWa: config.platform.wa,
    adminPhone: config.platform.phone,
    fees: config.platform.fees,
    adminOtpEmail: config.admin.email,
    adminOtpEmailReady: isSmtpConfigured(),
    google: {
      enabled: isGoogleConfigured(),
      devLogin: isGoogleDevLoginEnabled(),
      clientId: config.google.clientId || null,
      redirectEnabled: isGoogleRedirectConfigured(),
    },
  });
});

router.get(
  '/by-serial/:serial',
  param('serial').isInt({ min: 1 }),
  validate,
  asyncHandler(async (req, res) => {
    res.json({
      listing: await getListingBySerial(req.params.serial, { publicOnly: !isStaffUser(req.user) }),
    });
  })
);

router.get(
  '/:id',
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    res.json({
      listing: await getListingById(req.params.id, { publicOnly: !isStaffUser(req.user) }),
    });
  })
);

function parseListingUpload(req, res, next) {
  upload.array('photos', 12)(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}

function parsePhotoCapturedAt(timeValue) {
  if (!timeValue) return new Date();
  const d = new Date(timeValue);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

router.post(
  '/',
  authenticate,
  requireAgentApproved,
  uploadLimiter,
  parseListingUpload,
  body('title').trim().isLength({ min: 3, max: 200 }),
  body('type').trim().notEmpty(),
  body('price').isInt({ min: 1000 }),
  body('area').trim().notEmpty(),
  body('distance').trim().notEmpty(),
  body('description').optional({ values: 'falsy' }).trim(),
  body('landmark').optional({ values: 'falsy' }).trim(),
  body('amenities').optional(),
  validate,
  asyncHandler(async (req, res) => {
    if (!req.files?.length || req.files.length < 5) {
      throw new AppError('At least 5 photos required', 400, 'PHOTOS_REQUIRED');
    }

    let meta = [];
    try {
      meta = JSON.parse(req.body.photoMetadata || '[]');
    } catch { meta = []; }

    let locationPin = null;
    try {
      locationPin = JSON.parse(req.body.locationPin || 'null');
    } catch { locationPin = null; }

    if (locationPin?.gps_lat && locationPin?.gps_lng) {
      meta = meta.map((m) => (
        m?.gps_lat ? m : { ...m, ...locationPin, verified_capture: true }
      ));
    }

    const secureUrls = await uploadListingImages(req.files);

    const photoRecords = secureUrls.map((url, i) => {
      const m = meta[i] || {};
      return {
        url,
        gps_lat: m.gps_lat || null,
        gps_lng: m.gps_lng || null,
        gps_acc: m.gps_acc || null,
        device: m.device || null,
        captured_at: parsePhotoCapturedAt(m.time),
        metadata: m,
      };
    });

    const amenities = typeof req.body.amenities === 'string'
      ? JSON.parse(req.body.amenities)
      : req.body.amenities || [];

    const listing = await createListing(
      req.user.id,
      {
        title: req.body.title,
        type: req.body.type,
        price: parseInt(req.body.price, 10),
        description: req.body.description || null,
        area: req.body.area,
        landmark: req.body.landmark || null,
        distance: req.body.distance,
        amenities,
      },
      photoRecords
    );

    res.status(201).json({ listing });
  })
);

export default router;
