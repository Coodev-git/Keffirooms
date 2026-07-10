import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { config, isCloudinaryConfigured } from '../config/index.js';
import { AppError } from '../utils/errors.js';

let configured = false;

function ensureConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new AppError(
      'Image upload is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      503,
      'CLOUDINARY_NOT_CONFIGURED'
    );
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
      secure: true,
    });
    configured = true;
  }
}

function uploadBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        overwrite: false,
      },
      (err, result) => {
        if (err) return reject(err);
        if (!result?.secure_url) {
          return reject(new Error('Cloudinary did not return a secure_url'));
        }
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

/** Dev-only fallback when Cloudinary secret is not set locally */
async function uploadListingImagesLocalDev(files) {
  const dir = path.join(config.upload.dir, 'listings');
  fs.mkdirSync(dir, { recursive: true });
  const urls = [];
  for (const file of files) {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const name = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(dir, name), file.buffer);
    urls.push(`/uploads/listings/${name}`);
  }
  return urls;
}

/** Upload listing photos; production uses Cloudinary secure_url only */
export async function uploadListingImages(files) {
  if (!files?.length) {
    throw new AppError('No images to upload', 400, 'PHOTOS_REQUIRED');
  }

  if (!isCloudinaryConfigured()) {
    if (!config.isProd) {
      console.warn('[dev] Cloudinary not configured — saving photos to server/uploads');
      return uploadListingImagesLocalDev(files);
    }
    ensureConfigured();
  }

  ensureConfigured();
  const results = [];
  for (const file of files) {
    try {
      const secureUrl = await uploadBuffer(file.buffer, config.cloudinary.listingFolder);
      results.push(secureUrl);
    } catch (err) {
      console.error('Cloudinary upload failed:', err.message);
      throw new AppError(
        'Image upload failed. Please try again.',
        502,
        'CLOUDINARY_UPLOAD_FAILED'
      );
    }
  }
  return results;
}
