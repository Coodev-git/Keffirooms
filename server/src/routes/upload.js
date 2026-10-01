import { Router } from 'express';
import { authenticate, requireAgentApproved, asyncHandler } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { generateUploadSignature } from '../services/cloudinaryService.js';

const router = Router();

/**
 * POST /api/upload/signature
 *
 * Returns signed parameters for direct browser-to-Cloudinary upload.
 * The frontend uses these to POST the image directly to Cloudinary's API,
 * avoiding server bandwidth and memory consumption.
 *
 * Response:
 * {
 *   cloudName: "...",
 *   apiKey: "...",
 *   timestamp: 1234567890,
 *   signature: "...",
 *   folder: "keffirooms/listings",
 *   eager: "..."
 * }
 *
 * The api_secret is NEVER returned to the client.
 */
router.post(
  '/signature',
  authenticate,
  requireAgentApproved,
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const folder = req.body.folder || undefined; // optional override
    const params = generateUploadSignature({ folder });
    res.json(params);
  })
);

export default router;
