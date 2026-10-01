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

/**
 * Upload a buffer to Cloudinary and return full image metadata.
 * @returns {{ secure_url, public_id, width, height, format }}
 */
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
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
        });
      }
    );
    stream.end(buffer);
  });
}

async function uploadImagesLocalDev(files, localSubdir) {
  const dir = path.join(config.upload.dir, localSubdir);
  fs.mkdirSync(dir, { recursive: true });
  const results = [];
  for (const file of files) {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const name = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(dir, name), file.buffer);
    results.push({
      secure_url: `/uploads/${localSubdir}/${name}`,
      public_id: null,
      width: null,
      height: null,
      format: ext.slice(1),
    });
  }
  return results;
}

/**
 * Upload files to Cloudinary (or local dev fallback).
 * @returns {Array<{ secure_url, public_id, width, height, format }>}
 */
async function uploadImagesToFolder(files, folder, localSubdir) {
  if (!files?.length) {
    throw new AppError('No images to upload', 400, 'PHOTOS_REQUIRED');
  }

  if (!isCloudinaryConfigured()) {
    if (!config.isProd) {
      console.warn(`[dev] Cloudinary not configured — saving photos to server/uploads/${localSubdir}`);
      return uploadImagesLocalDev(files, localSubdir);
    }
    ensureConfigured();
  }

  ensureConfigured();
  const results = [];
  for (const file of files) {
    try {
      const result = await uploadBuffer(file.buffer, folder);
      results.push(result);
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

/** Upload listing photos; returns full Cloudinary metadata per image */
export async function uploadListingImages(files) {
  return uploadImagesToFolder(files, config.cloudinary.listingFolder, 'listings');
}

/** Upload hotel photos to Cloudinary (separate folder from property listings) */
export async function uploadHotelImages(files) {
  const folder = process.env.CLOUDINARY_HOTEL_FOLDER || 'keffirooms/hotels';
  return uploadImagesToFolder(files, folder, 'hotels');
}

/**
 * Generate signed parameters for direct browser → Cloudinary upload.
 * The api_secret is NEVER included in the response.
 *
 * @param {object} [opts]
 * @param {string} [opts.folder] — override default listing folder
 * @returns {{ cloudName, apiKey, timestamp, signature, folder }}
 */
export function generateUploadSignature({ folder } = {}) {
  ensureConfigured();

  const timestamp = Math.round(Date.now() / 1000);
  const uploadFolder = folder || config.cloudinary.listingFolder;

  // Parameters that must be included in the signature
  const params = {
    timestamp,
    folder: uploadFolder,
  };

  const signature = cloudinary.utils.api_sign_request(
    params,
    config.cloudinary.apiSecret
  );

  return {
    cloudName: config.cloudinary.cloudName,
    apiKey: config.cloudinary.apiKey,
    timestamp,
    signature,
    folder: uploadFolder,
  };
}

/**
 * Delete an image from Cloudinary by public_id.
 * Gracefully handles missing public_id (legacy/local uploads).
 */
export async function deleteCloudinaryImage(publicId) {
  if (!publicId) return null;
  ensureConfigured();
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (err) {
    console.error(`Cloudinary delete failed for ${publicId}:`, err.message);
    return null;
  }
}
