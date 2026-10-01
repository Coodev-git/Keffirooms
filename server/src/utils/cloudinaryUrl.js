import { config } from '../config/index.js';

/**
 * Generate a Cloudinary transformation URL from a public_id.
 *
 * @param {string} publicId — Cloudinary public_id (e.g. "keffirooms/listings/abc123")
 * @param {object} opts
 * @param {number}  [opts.width]   — target width in px
 * @param {number}  [opts.height]  — target height in px
 * @param {string}  [opts.crop]    — crop mode (default: 'fill')
 * @param {string}  [opts.quality] — quality (default: 'auto')
 * @param {string}  [opts.format]  — format (default: 'auto')
 * @param {string}  [opts.gravity] — gravity for crop (default: 'auto')
 * @returns {string} transformed URL
 */
export function cloudinaryTransformUrl(publicId, opts = {}) {
  if (!publicId || !config.cloudinary.cloudName) return null;

  const parts = [];
  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  parts.push(`c_${opts.crop || 'fill'}`);
  parts.push(`g_${opts.gravity || 'auto'}`);
  parts.push(`q_${opts.quality || 'auto'}`);
  parts.push(`f_${opts.format || 'auto'}`);

  const transform = parts.join(',');
  return `https://res.cloudinary.com/${config.cloudinary.cloudName}/image/upload/${transform}/${publicId}`;
}

/** Preset sizes for property listings */
export const IMAGE_PRESETS = {
  thumbnail: { width: 200, height: 150 },
  card:      { width: 400, height: 300 },
  detail:    { width: 800, height: 600 },
};

/**
 * Given a photo record (with optional public_id and url), return an object
 * with the original URL plus optimized variants.
 *
 * Falls back gracefully when public_id is missing (legacy uploads).
 */
export function photoWithTransforms(photo) {
  const original = photo.url || photo.secure_url;
  const publicId = photo.public_id;

  if (!publicId) {
    // Legacy upload or local dev — no transforms available
    return {
      url: original,
      thumbnail: original,
      card: original,
      detail: original,
    };
  }

  return {
    url: original,
    thumbnail: cloudinaryTransformUrl(publicId, IMAGE_PRESETS.thumbnail),
    card:      cloudinaryTransformUrl(publicId, IMAGE_PRESETS.card),
    detail:    cloudinaryTransformUrl(publicId, IMAGE_PRESETS.detail),
  };
}
