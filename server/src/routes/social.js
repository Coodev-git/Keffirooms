import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate, asyncHandler } from '../middleware/auth.js';
import { createInquiry, getConversation, sendMessage } from '../services/messageService.js';
import { createReview } from '../services/reviewService.js';
import { toggleFavorite, listFavorites } from '../services/reviewService.js';
import { getListingById } from '../services/listingService.js';

const router = Router();

router.post(
  '/inquiries',
  body('listingId').isUUID(),
  body('message').optional().trim(),
  validate,
  asyncHandler(async (req, res) => {
    const result = await createInquiry({
      listingId: req.body.listingId,
      seekerId: req.user?.id,
      message: req.body.message,
      guestPhone: req.body.guestPhone,
      guestName: req.body.guestName,
    });
    res.status(201).json(result);
  })
);

router.get(
  '/conversations/:id',
  param('id').isUUID(),
  validate,
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await getConversation(req.params.id, req.user.id));
  })
);

router.post(
  '/conversations/:id/messages',
  param('id').isUUID(),
  body('body').trim().notEmpty(),
  validate,
  authenticate,
  asyncHandler(async (req, res) => {
    const msg = await sendMessage(req.params.id, req.user.id, req.user.role, req.body.body);
    res.status(201).json({ message: msg });
  })
);

router.post(
  '/reviews',
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional().trim(),
  body('listingId').optional().isUUID(),
  body('inquiryId').optional().isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const review = await createReview({
      listingId: req.body.listingId,
      seekerId: req.user?.id,
      inquiryId: req.body.inquiryId,
      rating: req.body.rating,
      comment: req.body.comment,
    });
    res.status(201).json({ review });
  })
);

router.get(
  '/favorites',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ ids: await listFavorites(req.user.id) });
  })
);

router.post(
  '/favorites/:listingId',
  param('listingId').isUUID(),
  validate,
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await toggleFavorite(req.user.id, req.params.listingId));
  })
);

export default router;
