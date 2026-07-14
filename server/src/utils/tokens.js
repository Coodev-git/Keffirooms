import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { resolvePhotoUrl } from './photoUrl.js';

export function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpires,
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpires,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseDuration(str) {
  const m = String(str).match(/^(\d+)([smhd])$/);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
  return n * unit;
}

export function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    role: row.role,
    name: row.name,
    avatarUrl: row.avatar_url,
    emailVerified: row.email_verified,
    agentStatus: row.agent_status || (row.role === 'agent' ? row.status : null) || null,
    hotelOwnerStatus: row.hotel_owner_status || null,
    isPromotedAdmin: row.is_promoted_admin || false,
    createdAt: row.created_at,
  };
}

export function listingToClient(row, photos = [], opts = {}) {
  const listing = {
    id: row.id,
    serialNumber: row.serial_number,
    listingTag: row.serial_number ? `#${row.serial_number}` : null,
    title: row.title,
    type: row.type,
    price: row.price,
    description: row.description,
    area: row.area,
    landmark: row.landmark,
    distance: row.distance,
    amenities: row.amenities || [],
    status: row.status,
    agentId: row.agent_id,
    agentName: row.agent_name,
    agentPhone: row.agent_phone,
    agentRole: 'Agent',
    photos: photos.map((p) => resolvePhotoUrl(p.url)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (!opts.hideAgentContact) {
    listing.photoMetadata = photos.map((p) => ({
      time: p.captured_at,
      gps_lat: p.gps_lat,
      gps_lng: p.gps_lng,
      gps_acc: p.gps_acc,
      device: p.device,
      ...p.metadata,
    }));
  }
  if (opts.hideAgentContact) {
    delete listing.agentPhone;
  }
  return listing;
}
