import multer from 'multer';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new AppError('Only JPEG, PNG, WebP, and GIF images are allowed', 400, 'INVALID_FILE'));
  }
  cb(null, true);
}

/** Memory storage only — files are uploaded to Cloudinary, not saved locally */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxBytes, files: 12 },
  fileFilter,
});
