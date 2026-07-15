import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { AppError } from '../utils/errors.js';
import { authenticate, requireAdminAccess, requireMasterAdmin, asyncHandler, isMasterAdmin } from '../middleware/auth.js';
import {
  listPendingAgents,
  listApprovedAgents,
  listDeniedAgents,
  setAgentStatus,
  getAgentProfileStatus,
  promoteAgent,
  listAllUsers,
  getKpiStats,
  getActivityLog,
  getFeeStats,
  listReviews,
} from '../services/adminService.js';
import { updateListingStatus, listListings } from '../services/listingService.js';
import { getTrustProfilesForAgents } from '../services/trustScoreService.js';
import { upload } from '../middleware/upload.js';
import { uploadHotelImages } from '../services/cloudinaryService.js';
import {
  listAllHotelsAdmin,
  getHotelById,
  createHotel,
  updateHotel,
  createHotelRoom,
  updateHotelRoom,
  listHotelBookings,
  updateHotelBookingStatus,
  listPendingHotelOwners,
  setHotelOwnerStatus,
  BOOKING_STATUSES,
} from '../services/hotelService.js';

const router = Router();

async function withAgentTrust(listings) {
  const agentIds = [...new Set(listings.map((l) => l.agentId).filter(Boolean))];
  const trustMap = await getTrustProfilesForAgents(agentIds);
  return listings.map((l) => {
    const trust = trustMap[l.agentId];
    return {
      ...l,
      agentTrustScore: trust?.trustScore ?? null,
      agentTrustLabel: trust?.trustLabel ?? null,
      agentTrustTier: trust?.trustTier ?? null,
    };
  });
}

router.use(authenticate, requireAdminAccess);

router.get(
  '/listings/pending',
  asyncHandler(async (req, res) => {
    const listings = await listListings({ status: 'pending', includeUnavailable: true });
    res.json({ listings: await withAgentTrust(listings) });
  })
);

router.get(
  '/listings',
  asyncHandler(async (req, res) => {
    const listings = await listListings({ includeUnavailable: true });
    res.json({ listings: await withAgentTrust(listings) });
  })
);

router.patch(
  '/listings/:id/status',
  param('id').isUUID(),
  body('status').isIn(['verified', 'rejected', 'unavailable', 'pending']),
  body('notes').optional().trim(),
  validate,
  asyncHandler(async (req, res) => {
    if (['rejected', 'unavailable'].includes(req.body.status) && !isMasterAdmin(req.user)) {
      throw new AppError('Master admin access required', 403, 'FORBIDDEN');
    }
    const listing = await updateListingStatus(
      req.params.id,
      req.body.status,
      req.user.id,
      req.body.notes
    );
    res.json({ listing });
  })
);

router.get(
  '/agents/pending',
  asyncHandler(async (req, res) => {
    res.json({ agents: await listPendingAgents() });
  })
);

router.get(
  '/agents/approved',
  asyncHandler(async (req, res) => {
    res.json({ agents: await listApprovedAgents() });
  })
);

router.get(
  '/agents/denied',
  asyncHandler(async (req, res) => {
    res.json({ agents: await listDeniedAgents() });
  })
);

router.patch(
  '/agents/:id/status',
  param('id').isUUID(),
  body('status').isIn(['approved', 'denied', 'pending']),
  validate,
  asyncHandler(async (req, res) => {
    if (req.body.status === 'denied') {
      const current = await getAgentProfileStatus(req.params.id);
      if (current === 'approved' && !isMasterAdmin(req.user)) {
        throw new AppError('Master admin access required to revoke agents', 403, 'FORBIDDEN');
      }
    }
    const result = await setAgentStatus(req.params.id, req.body.status, req.user.id);
    res.json(result);
  })
);

router.post(
  '/agents/:id/promote',
  requireMasterAdmin,
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    await promoteAgent(req.params.id, req.user.id);
    res.json({ message: 'Agent promoted' });
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    res.json({ users: await listAllUsers() });
  })
);

router.get(
  '/kpi',
  asyncHandler(async (req, res) => {
    res.json(await getKpiStats());
  })
);

router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    res.json({ events: await getActivityLog() });
  })
);

router.get(
  '/fees',
  asyncHandler(async (req, res) => {
    const stats = await getFeeStats();
    const reviews = await listReviews();
    res.json({ ...stats, reviews });
  })
);

/* ── HotelSpace (hotel_*) admin ── */

router.get(
  '/hotel-owners/pending',
  asyncHandler(async (req, res) => {
    res.json({ owners: await listPendingHotelOwners() });
  })
);

router.patch(
  '/hotel-owners/:id/status',
  param('id').isUUID(),
  body('status').isIn(['approved', 'denied', 'pending']),
  validate,
  asyncHandler(async (req, res) => {
    const profile = await setHotelOwnerStatus(req.params.id, req.body.status, req.user.id);
    res.json({ profile });
  })
);

router.get(
  '/hotels',
  asyncHandler(async (req, res) => {
    res.json({ hotels: await listAllHotelsAdmin() });
  })
);

router.get(
  '/hotels/:id',
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    res.json({ hotel: await getHotelById(req.params.id, { admin: true }) });
  })
);

router.post(
  '/hotels',
  upload.array('photos', 12),
  body('name').trim().isLength({ min: 2, max: 200 }),
  body('locationAddress').trim().isLength({ min: 5 }),
  body('managerPhone').trim().notEmpty(),
  body('priceRangeMin').isInt({ min: 0 }),
  body('priceRangeMax').isInt({ min: 0 }),
  validate,
  asyncHandler(async (req, res) => {
    let photos = [];
    if (req.files?.length) {
      const urls = await uploadHotelImages(req.files);
      let meta = [];
      try { meta = JSON.parse(req.body.photoMetadata || '[]'); } catch { meta = []; }
      photos = urls.map((url, i) => ({ url, metadata: meta[i] || null }));
    } else if (req.body.photos) {
      try {
        photos = typeof req.body.photos === 'string'
          ? JSON.parse(req.body.photos)
          : req.body.photos;
      } catch {
        photos = [];
      }
    }
    let amenities = [];
    if (req.body.amenities) {
      try {
        amenities = typeof req.body.amenities === 'string'
          ? JSON.parse(req.body.amenities)
          : req.body.amenities;
      } catch {
        amenities = String(req.body.amenities).split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    const hotel = await createHotel({
      name: req.body.name,
      description: req.body.description,
      locationAddress: req.body.locationAddress,
      area: req.body.area || null,
      landmark: req.body.landmark || null,
      priceRangeMin: parseInt(req.body.priceRangeMin, 10),
      priceRangeMax: parseInt(req.body.priceRangeMax, 10),
      rating: req.body.rating !== undefined && req.body.rating !== ''
        ? parseFloat(req.body.rating)
        : null,
      managerPhone: req.body.managerPhone,
      backupPhone: req.body.backupPhone || null,
      photos,
      amenities,
      isActive: req.body.isActive !== 'false' && req.body.isActive !== false,
      verifyStatus: 'verified',
    });
    res.status(201).json({ hotel });
  })
);

router.patch(
  '/hotels/:id',
  param('id').isUUID(),
  upload.array('photos', 12),
  validate,
  asyncHandler(async (req, res) => {
    const patch = { ...req.body };
    if (req.files?.length) {
      const uploaded = await uploadHotelImages(req.files);
      const existing = await getHotelById(req.params.id, { admin: true });
      let meta = [];
      try { meta = JSON.parse(req.body.photoMetadata || '[]'); } catch { meta = []; }
      const existingEntries = existing.photoEntries
        || (existing.photos || []).map((url) => ({ url, metadata: null }));
      const newEntries = uploaded.map((url, i) => ({ url, metadata: meta[i] || null }));
      patch.photos = [...existingEntries, ...newEntries].slice(0, 6);
    } else if (typeof req.body.photos === 'string') {
      try {
        patch.photos = JSON.parse(req.body.photos);
      } catch { /* keep as-is */ }
    }
    if (typeof req.body.amenities === 'string') {
      try {
        patch.amenities = JSON.parse(req.body.amenities);
      } catch {
        patch.amenities = req.body.amenities.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    if (patch.priceRangeMin != null) patch.priceRangeMin = parseInt(patch.priceRangeMin, 10);
    if (patch.priceRangeMax != null) patch.priceRangeMax = parseInt(patch.priceRangeMax, 10);
    if (patch.rating === '') patch.rating = null;
    else if (patch.rating != null) patch.rating = parseFloat(patch.rating);
    if (patch.isActive === 'true') patch.isActive = true;
    if (patch.isActive === 'false') patch.isActive = false;
    const hotel = await updateHotel(req.params.id, patch);
    res.json({ hotel });
  })
);

router.post(
  '/hotels/:id/rooms',
  param('id').isUUID(),
  upload.array('photos', 4),
  body('roomType').trim().isLength({ min: 2, max: 80 }),
  body('price').isInt({ min: 1 }),
  validate,
  asyncHandler(async (req, res) => {
    let photos = [];
    if (req.files?.length) {
      const urls = await uploadHotelImages(req.files);
      let meta = [];
      try { meta = JSON.parse(req.body.photoMetadata || '[]'); } catch { meta = []; }
      photos = urls.map((url, i) => ({ url, metadata: meta[i] || null }));
    }
    const room = await createHotelRoom(req.params.id, {
      roomType: req.body.roomType,
      price: parseInt(req.body.price, 10),
      description: req.body.description,
      isAvailable: req.body.isAvailable !== false && req.body.isAvailable !== 'false',
      photos,
    });
    res.status(201).json({ room });
  })
);

router.patch(
  '/rooms/:id',
  param('id').isUUID(),
  upload.array('photos', 4),
  validate,
  asyncHandler(async (req, res) => {
    const patch = { ...req.body };
    if (patch.price != null) patch.price = parseInt(patch.price, 10);
    if (patch.isAvailable === 'true') patch.isAvailable = true;
    if (patch.isAvailable === 'false') patch.isAvailable = false;
    if (req.files?.length) {
      const { query } = await import('../db/pool.js');
      const { rows } = await query('SELECT photos FROM hotel_rooms WHERE id = $1', [req.params.id]);
      if (!rows[0]) {
        throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
      }
      const uploaded = await uploadHotelImages(req.files);
      let meta = [];
      try { meta = JSON.parse(req.body.photoMetadata || '[]'); } catch { meta = []; }
      let current = rows[0].photos;
      if (typeof current === 'string') {
        try { current = JSON.parse(current); } catch { current = []; }
      }
      if (!Array.isArray(current)) current = [];
      const existing = current.map((item) => (
        typeof item === 'string' ? { url: item, metadata: null } : item
      ));
      const newEntries = uploaded.map((url, i) => ({ url, metadata: meta[i] || null }));
      patch.photos = [...existing, ...newEntries].slice(0, 4);
    }
    const room = await updateHotelRoom(req.params.id, patch);
    res.json({ room });
  })
);

router.get(
  '/hotel-bookings',
  asyncHandler(async (req, res) => {
    const status = req.query.status || undefined;
    res.json({ bookings: await listHotelBookings({ status }) });
  })
);

router.patch(
  '/hotel-bookings/:id/status',
  param('id').isUUID(),
  body('status').isIn(BOOKING_STATUSES),
  validate,
  asyncHandler(async (req, res) => {
    const booking = await updateHotelBookingStatus(req.params.id, req.body.status);
    res.json({ booking });
  })
);

export default router;
