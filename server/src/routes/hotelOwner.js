import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import {
  authenticate,
  requireHotelOwnerApproved,
  asyncHandler,
} from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { uploadHotelImages } from '../services/cloudinaryService.js';
import {
  getHotelForOwner,
  updateHotel,
  createHotelRoom,
  updateHotelRoom,
  listOwnerBookings,
  getHotelById,
} from '../services/hotelService.js';
import { AppError } from '../utils/errors.js';

const router = Router();
const HOTEL_PHOTO_MAX = 6;
const ROOM_PHOTO_MAX = 4;

router.use(authenticate, requireHotelOwnerApproved);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const hotel = await getHotelForOwner(req.user.id);
    res.json({ hotel });
  })
);

router.patch(
  '/mine',
  upload.array('photos', HOTEL_PHOTO_MAX),
  validate,
  asyncHandler(async (req, res) => {
    const hotel = await getHotelForOwner(req.user.id);
    const patch = { ...req.body };
    if (req.files?.length) {
      const uploaded = await uploadHotelImages(req.files);
      patch.photos = [...(hotel.photos || []), ...uploaded].slice(0, HOTEL_PHOTO_MAX);
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
    if (patch.pinLat != null && patch.pinLat !== '') patch.pinLat = parseFloat(patch.pinLat);
    if (patch.pinLng != null && patch.pinLng !== '') patch.pinLng = parseFloat(patch.pinLng);
    delete patch.isActive;
    delete patch.verifyStatus;
    const updated = await updateHotel(hotel.id, patch);
    res.json({ hotel: updated });
  })
);

router.post(
  '/mine/rooms',
  upload.array('photos', ROOM_PHOTO_MAX),
  body('roomType').trim().isLength({ min: 2, max: 80 }),
  body('price').isInt({ min: 1 }),
  validate,
  asyncHandler(async (req, res) => {
    const hotel = await getHotelForOwner(req.user.id);
    let photos = [];
    if (req.files?.length) {
      photos = await uploadHotelImages(req.files);
    }
    const room = await createHotelRoom(hotel.id, {
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
  upload.array('photos', ROOM_PHOTO_MAX),
  validate,
  asyncHandler(async (req, res) => {
    const hotel = await getHotelForOwner(req.user.id);
    const full = await getHotelById(hotel.id, { ownerId: req.user.id });
    const existing = (full.rooms || []).find((r) => r.id === req.params.id);
    if (!existing) throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');

    const patch = { ...req.body };
    if (patch.price != null) patch.price = parseInt(patch.price, 10);
    if (patch.isAvailable === 'true') patch.isAvailable = true;
    if (patch.isAvailable === 'false') patch.isAvailable = false;

    if (req.files?.length) {
      const uploaded = await uploadHotelImages(req.files);
      patch.photos = [...(existing.photos || []), ...uploaded].slice(0, ROOM_PHOTO_MAX);
    }

    const updated = await updateHotelRoom(req.params.id, patch);
    res.json({ room: updated });
  })
);

router.get(
  '/mine/bookings',
  asyncHandler(async (req, res) => {
    res.json({ bookings: await listOwnerBookings(req.user.id) });
  })
);

export default router;
