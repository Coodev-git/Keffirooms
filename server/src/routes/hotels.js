import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/auth.js';
import {
  listActiveHotels,
  getHotelById,
  createHotelBooking,
} from '../services/hotelService.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const hotels = await listActiveHotels();
    res.json({ hotels });
  })
);

router.get(
  '/:id',
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const hotel = await getHotelById(req.params.id);
    res.json({ hotel });
  })
);

router.post(
  '/bookings',
  body('roomId').isUUID(),
  body('studentName').trim().isLength({ min: 2, max: 120 }),
  body('studentPhone').trim().notEmpty(),
  body('requestedCheckinDate').matches(/^\d{4}-\d{2}-\d{2}$/),
  body('requestedCheckoutDate').matches(/^\d{4}-\d{2}-\d{2}$/),
  validate,
  asyncHandler(async (req, res) => {
    const booking = await createHotelBooking({
      roomId: req.body.roomId,
      studentName: req.body.studentName,
      studentPhone: req.body.studentPhone,
      requestedCheckinDate: req.body.requestedCheckinDate,
      requestedCheckoutDate: req.body.requestedCheckoutDate,
    });
    res.status(201).json({ booking });
  })
);

export default router;
