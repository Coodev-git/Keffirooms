import { config } from '../config/index.js';

/** Normalize stored photo paths to absolute URLs (legacy /uploads + Cloudinary https) */
export function resolvePhotoUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${config.appUrl.replace(/\/$/, '')}${trimmed}`;
  return trimmed;
}

export function resolvePhotoUrls(urls) {
  return (urls || []).map(resolvePhotoUrl).filter(Boolean);
}
