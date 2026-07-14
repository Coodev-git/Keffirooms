import crypto from 'crypto';
import { query, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { normalizeNigerianPhone, toWhatsAppIntl } from '../utils/phone.js';
import { config } from '../config/index.js';

const BOOKING_STATUSES = [
  'pending',
  'payment_confirmed',
  'hotel_contacted',
  'confirmed',
  'expired',
  'cancelled',
];

/** Social-proof photo caps (shop storefront) */
const HOTEL_PHOTO_MAX = 6;
const ROOM_PHOTO_MAX = 4;

function clampPhotoList(list, max) {
  return (Array.isArray(list) ? list : []).filter(Boolean).slice(0, max);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function endOfDate(dateStr) {
  const d = new Date(`${dateStr}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) {
    throw new AppError('Invalid check-in date', 400, 'INVALID_DATE');
  }
  return d;
}

function generateBookingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return `KR-${code}`;
}

function hotelToClient(row, rooms = [], { includeAddress = false, includePhones = false, includePin = false } = {}) {
  if (!row) return null;
  const hasPin = row.pin_lat != null && row.pin_lng != null;
  const hotel = {
    id: row.id,
    name: row.name,
    description: row.description,
    area: row.area || null,
    landmark: row.landmark || null,
    priceRangeMin: row.price_range_min,
    priceRangeMax: row.price_range_max,
    rating: row.rating != null ? Number(row.rating) : null,
    photos: clampPhotoList(parseJsonArray(row.photos), HOTEL_PHOTO_MAX),
    amenities: parseJsonArray(row.amenities),
    isActive: row.is_active,
    verifyStatus: row.verify_status || 'verified',
    ownerId: row.owner_id || null,
    ownerName: row.owner_name || null,
    ownerPhone: row.owner_phone || null,
    ownerStatus: row.owner_status || null,
    hasPin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rooms: rooms.map(roomToClient),
  };
  const roomPhotos = hotel.rooms.flatMap((r) => r.photos || []).slice(0, 8);
  hotel.proofPhotos = [...hotel.photos, ...roomPhotos].slice(0, 8);
  hotel.roomCount = hotel.rooms.length;
  if (includeAddress) hotel.locationAddress = row.location_address;
  if (includePin && hasPin) {
    hotel.pinLat = Number(row.pin_lat);
    hotel.pinLng = Number(row.pin_lng);
    hotel.pinAcc = row.pin_acc || null;
  }
  if (includePhones) {
    hotel.managerPhone = row.manager_phone;
    hotel.backupPhone = row.backup_phone;
    hotel.managerWa = toWhatsAppIntl(row.manager_phone);
    hotel.backupWa = row.backup_phone ? toWhatsAppIntl(row.backup_phone) : null;
  }
  return hotel;
}

function parsePin(data) {
  if (data.pinLat == null || data.pinLng == null || data.pinLat === '' || data.pinLng === '') {
    return { pinLat: null, pinLng: null, pinAcc: null };
  }
  const pinLat = Number(data.pinLat);
  const pinLng = Number(data.pinLng);
  if (!Number.isFinite(pinLat) || !Number.isFinite(pinLng)) {
    throw new AppError('Invalid map pin coordinates', 400, 'INVALID_PIN');
  }
  if (pinLat < -90 || pinLat > 90 || pinLng < -180 || pinLng > 180) {
    throw new AppError('Invalid map pin coordinates', 400, 'INVALID_PIN');
  }
  return {
    pinLat,
    pinLng,
    pinAcc: data.pinAcc ? String(data.pinAcc).slice(0, 20) : null,
  };
}

function roomToClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    hotelId: row.hotel_id,
    roomType: row.room_type,
    price: row.price,
    description: row.description,
    isAvailable: row.is_available,
    photos: clampPhotoList(parseJsonArray(row.photos), ROOM_PHOTO_MAX),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function bookingToClient(row, { includeStudentPhone = false } = {}) {
  if (!row) return null;
  const booking = {
    id: row.id,
    bookingCode: row.booking_code,
    hotelId: row.hotel_id,
    roomId: row.room_id,
    hotelName: row.hotel_name,
    roomType: row.room_type,
    roomPrice: row.room_price,
    studentName: row.student_name,
    requestedCheckinDate: row.requested_checkin_date,
    requestedCheckoutDate: row.requested_checkout_date,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    managerPhone: row.manager_phone || null,
    managerWa: row.manager_phone ? toWhatsAppIntl(row.manager_phone) : null,
    coordinatorWa: toWhatsAppIntl(config.platform.wa) || config.platform.wa,
  };
  if (includeStudentPhone) booking.studentPhone = row.student_phone;
  return booking;
}

async function loadRoomsForHotels(hotelIds, { availableOnly = false } = {}) {
  if (!hotelIds.length) return {};
  const clauses = ['hotel_id = ANY($1::uuid[])'];
  if (availableOnly) clauses.push('is_available = TRUE');
  const { rows } = await query(
    `SELECT * FROM hotel_rooms WHERE ${clauses.join(' AND ')} ORDER BY price ASC, created_at ASC`,
    [hotelIds]
  );
  const map = {};
  for (const row of rows) {
    if (!map[row.hotel_id]) map[row.hotel_id] = [];
    map[row.hotel_id].push(row);
  }
  return map;
}

export async function listActiveHotels() {
  const { rows } = await query(
    `SELECT * FROM hotels
     WHERE is_active = TRUE AND verify_status = 'verified'
     ORDER BY rating DESC NULLS LAST, created_at DESC`
  );
  const roomsMap = await loadRoomsForHotels(rows.map((r) => r.id), { availableOnly: true });
  return rows.map((r) => hotelToClient(r, roomsMap[r.id] || []));
}

export async function listAllHotelsAdmin() {
  const { rows } = await query(
    `SELECT h.*,
            u.name AS owner_name,
            u.phone AS owner_phone,
            hop.status AS owner_status
     FROM hotels h
     LEFT JOIN users u ON u.id = h.owner_id
     LEFT JOIN hotel_owner_profiles hop ON hop.user_id = h.owner_id
     ORDER BY h.verify_status ASC, h.is_active DESC, h.created_at DESC`
  );
  const roomsMap = await loadRoomsForHotels(rows.map((r) => r.id));
  return rows.map((r) => hotelToClient(r, roomsMap[r.id] || [], {
    includeAddress: true,
    includePhones: true,
    includePin: true,
  }));
}

export async function getHotelById(id, { admin = false, ownerId = null } = {}) {
  const { rows } = await query(`SELECT * FROM hotels WHERE id = $1`, [id]);
  if (!rows[0]) throw new AppError('Hotel not found', 404, 'HOTEL_NOT_FOUND');
  const isOwner = ownerId && rows[0].owner_id === ownerId;
  if (!admin && !isOwner) {
    if (!rows[0].is_active || rows[0].verify_status !== 'verified') {
      throw new AppError('Hotel not found', 404, 'HOTEL_NOT_FOUND');
    }
  }
  const roomsMap = await loadRoomsForHotels([id], { availableOnly: !(admin || isOwner) });
  return hotelToClient(rows[0], roomsMap[id] || [], {
    includeAddress: admin || isOwner,
    includePhones: admin || isOwner,
    includePin: admin || isOwner,
  });
}

export async function getHotelForOwner(ownerId) {
  const { rows } = await query(
    `SELECT h.*, hop.status AS owner_status
     FROM hotels h
     LEFT JOIN hotel_owner_profiles hop ON hop.user_id = h.owner_id
     WHERE h.owner_id = $1
     ORDER BY h.created_at ASC
     LIMIT 1`,
    [ownerId]
  );
  if (!rows[0]) throw new AppError('No hotel linked to this account', 404, 'HOTEL_NOT_FOUND');
  const hotel = await getHotelById(rows[0].id, { ownerId });
  hotel.ownerStatus = rows[0].owner_status;
  return hotel;
}

export async function listOwnerBookings(ownerId) {
  await expireOverdueBookings();
  const { rows } = await query(
    `SELECT b.*,
            h.name AS hotel_name,
            h.manager_phone,
            r.room_type,
            r.price AS room_price
     FROM hotel_bookings b
     JOIN hotels h ON h.id = b.hotel_id
     JOIN hotel_rooms r ON r.id = b.room_id
     WHERE h.owner_id = $1
     ORDER BY b.created_at DESC`,
    [ownerId]
  );
  return rows.map((r) => bookingToClient(r, { includeStudentPhone: false }));
}

export async function createHotel(data) {
  const managerPhone = normalizeNigerianPhone(data.managerPhone);
  if (!managerPhone) {
    throw new AppError('Manager phone must be a valid Nigerian WhatsApp number', 400, 'INVALID_PHONE');
  }
  let backupPhone = null;
  if (data.backupPhone) {
    backupPhone = normalizeNigerianPhone(data.backupPhone);
    if (!backupPhone) {
      throw new AppError('Backup phone must be a valid Nigerian WhatsApp number', 400, 'INVALID_PHONE');
    }
  }

  const photos = clampPhotoList(data.photos, HOTEL_PHOTO_MAX);
  const amenities = Array.isArray(data.amenities) ? data.amenities : [];
  const pin = parsePin(data);

  const { rows } = await query(
    `INSERT INTO hotels
      (name, description, location_address, area, landmark, price_range_min, price_range_max,
       rating, manager_phone, backup_phone, photos, amenities, is_active, owner_id, verify_status,
       pin_lat, pin_lng, pin_acc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,COALESCE($13, TRUE),$14,COALESCE($15,'verified'),
             $16,$17,$18)
     RETURNING *`,
    [
      data.name,
      data.description || null,
      data.locationAddress,
      data.area || null,
      data.landmark || null,
      data.priceRangeMin,
      data.priceRangeMax,
      data.rating ?? null,
      managerPhone,
      backupPhone,
      JSON.stringify(photos),
      JSON.stringify(amenities),
      data.isActive ?? true,
      data.ownerId || null,
      data.verifyStatus || 'verified',
      pin.pinLat,
      pin.pinLng,
      pin.pinAcc,
    ]
  );
  return hotelToClient(rows[0], [], { includeAddress: true, includePhones: true, includePin: true });
}

export async function updateHotel(id, data) {
  const existing = await getHotelById(id, { admin: true });
  const managerPhone = data.managerPhone != null
    ? normalizeNigerianPhone(data.managerPhone)
    : existing.managerPhone;
  if (!managerPhone) {
    throw new AppError('Manager phone must be a valid Nigerian WhatsApp number', 400, 'INVALID_PHONE');
  }

  let backupPhone = existing.backupPhone;
  if (data.backupPhone !== undefined) {
    if (!data.backupPhone) backupPhone = null;
    else {
      backupPhone = normalizeNigerianPhone(data.backupPhone);
      if (!backupPhone) {
        throw new AppError('Backup phone must be a valid Nigerian WhatsApp number', 400, 'INVALID_PHONE');
      }
    }
  }

  const photos = data.photos !== undefined
    ? clampPhotoList(data.photos, HOTEL_PHOTO_MAX)
    : clampPhotoList(existing.photos, HOTEL_PHOTO_MAX);
  const amenities = data.amenities !== undefined ? data.amenities : existing.amenities;
  const nextPin = (data.pinLat !== undefined || data.pinLng !== undefined)
    ? parsePin(data)
    : {
      pinLat: existing.pinLat ?? null,
      pinLng: existing.pinLng ?? null,
      pinAcc: existing.pinAcc ?? null,
    };

  const { rows } = await query(
    `UPDATE hotels SET
      name = $2,
      description = $3,
      location_address = $4,
      area = COALESCE($5, area),
      landmark = COALESCE($6, landmark),
      price_range_min = $7,
      price_range_max = $8,
      rating = $9,
      manager_phone = $10,
      backup_phone = $11,
      photos = $12::jsonb,
      amenities = $13::jsonb,
      is_active = COALESCE($14, is_active),
      verify_status = COALESCE($15::hotel_verify_status, verify_status),
      pin_lat = $16,
      pin_lng = $17,
      pin_acc = $18
     WHERE id = $1
     RETURNING *`,
    [
      id,
      data.name ?? existing.name,
      data.description !== undefined ? data.description : existing.description,
      data.locationAddress ?? existing.locationAddress,
      data.area !== undefined ? data.area : existing.area,
      data.landmark !== undefined ? data.landmark : existing.landmark,
      data.priceRangeMin ?? existing.priceRangeMin,
      data.priceRangeMax ?? existing.priceRangeMax,
      data.rating !== undefined ? data.rating : existing.rating,
      managerPhone,
      backupPhone,
      JSON.stringify(photos || []),
      JSON.stringify(amenities || []),
      data.isActive,
      data.verifyStatus || null,
      nextPin.pinLat,
      nextPin.pinLng,
      nextPin.pinAcc,
    ]
  );
  const roomsMap = await loadRoomsForHotels([id]);
  return hotelToClient(rows[0], roomsMap[id] || [], { includeAddress: true, includePhones: true, includePin: true });
}

export async function createHotelRoom(hotelId, data) {
  await getHotelById(hotelId, { admin: true });
  const photos = clampPhotoList(data.photos, ROOM_PHOTO_MAX);
  const { rows } = await query(
    `INSERT INTO hotel_rooms (hotel_id, room_type, price, description, is_available, photos)
     VALUES ($1, $2, $3, $4, COALESCE($5, TRUE), $6::jsonb)
     RETURNING *`,
    [
      hotelId,
      data.roomType,
      data.price,
      data.description || null,
      data.isAvailable ?? true,
      JSON.stringify(photos),
    ]
  );
  return roomToClient(rows[0]);
}

export async function updateHotelRoom(roomId, data) {
  const { rows: existing } = await query(`SELECT * FROM hotel_rooms WHERE id = $1`, [roomId]);
  if (!existing[0]) throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
  const current = roomToClient(existing[0]);
  const photos = data.photos !== undefined
    ? clampPhotoList(data.photos, ROOM_PHOTO_MAX)
    : current.photos;

  const { rows } = await query(
    `UPDATE hotel_rooms SET
      room_type = COALESCE($2, room_type),
      price = COALESCE($3, price),
      description = COALESCE($4, description),
      is_available = COALESCE($5, is_available),
      photos = $6::jsonb
     WHERE id = $1
     RETURNING *`,
    [
      roomId,
      data.roomType,
      data.price,
      data.description,
      data.isAvailable,
      JSON.stringify(photos),
    ]
  );
  return roomToClient(rows[0]);
}

/** Expire overdue pending bookings (check-on-read) */
export async function expireOverdueBookings() {
  await query(
    `UPDATE hotel_bookings
     SET status = 'expired'
     WHERE status IN ('pending', 'payment_confirmed', 'hotel_contacted')
       AND expires_at < NOW()`
  );
}

export async function listHotelBookings({ status } = {}) {
  await expireOverdueBookings();
  const params = [];
  let where = '';
  if (status && BOOKING_STATUSES.includes(status)) {
    params.push(status);
    where = `WHERE b.status = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT b.*,
            h.name AS hotel_name,
            h.manager_phone,
            r.room_type,
            r.price AS room_price
     FROM hotel_bookings b
     JOIN hotels h ON h.id = b.hotel_id
     JOIN hotel_rooms r ON r.id = b.room_id
     ${where}
     ORDER BY b.created_at DESC`,
    params
  );
  return rows.map((r) => bookingToClient(r, { includeStudentPhone: true }));
}

export async function createHotelBooking(data) {
  const studentPhone = normalizeNigerianPhone(data.studentPhone);
  if (!studentPhone) {
    throw new AppError('Student phone must be a valid Nigerian WhatsApp number', 400, 'INVALID_PHONE');
  }
  if (!data.studentName?.trim()) {
    throw new AppError('Student name is required', 400, 'NAME_REQUIRED');
  }
  if (!data.requestedCheckinDate || !data.requestedCheckoutDate) {
    throw new AppError('Check-in and check-out dates are required', 400, 'DATES_REQUIRED');
  }
  if (data.requestedCheckoutDate <= data.requestedCheckinDate) {
    throw new AppError('Check-out must be after check-in', 400, 'INVALID_DATES');
  }

  const expiresAt = endOfDate(data.requestedCheckinDate);

  return withTransaction(async (client) => {
    const roomRes = await client.query(
      `SELECT r.*, h.name AS hotel_name, h.is_active AS hotel_active,
              h.verify_status AS hotel_verify, h.manager_phone, h.area AS hotel_area
       FROM hotel_rooms r
       JOIN hotels h ON h.id = r.hotel_id
       WHERE r.id = $1`,
      [data.roomId]
    );
    const room = roomRes.rows[0];
    if (!room || !room.hotel_active || room.hotel_verify !== 'verified') {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    if (!room.is_available) {
      throw new AppError('This room type is currently unavailable', 400, 'ROOM_UNAVAILABLE');
    }

    const checkin = new Date(`${data.requestedCheckinDate}T12:00:00`);
    const checkout = new Date(`${data.requestedCheckoutDate}T12:00:00`);
    const nights = Math.round((checkout - checkin) / 86400000);
    const estTotal = Number(room.price) * nights;

    let bookingCode;
    let insertRes;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      bookingCode = generateBookingCode();
      try {
        insertRes = await client.query(
          `INSERT INTO hotel_bookings
            (booking_code, hotel_id, room_id, student_name, student_phone,
             requested_checkin_date, requested_checkout_date, status, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8)
           RETURNING *`,
          [
            bookingCode,
            room.hotel_id,
            room.id,
            data.studentName.trim(),
            studentPhone,
            data.requestedCheckinDate,
            data.requestedCheckoutDate,
            expiresAt.toISOString(),
          ]
        );
        break;
      } catch (err) {
        if (err.code === '23505') continue;
        throw err;
      }
    }
    if (!insertRes?.rows?.[0]) {
      throw new AppError('Could not generate booking code. Try again.', 500, 'CODE_GEN_FAILED');
    }

    const row = {
      ...insertRes.rows[0],
      hotel_name: room.hotel_name,
      room_type: room.room_type,
      room_price: room.price,
      manager_phone: room.manager_phone,
    };
    const booking = bookingToClient(row, { includeStudentPhone: true });
    booking.nights = nights;
    booking.estimatedTotal = estTotal;
    booking.coordinatorWaMessage = [
      `KeffiRooms short-stay booking`,
      `Code: ${booking.bookingCode}`,
      `Hotel: ${booking.hotelName}${room.hotel_area ? ` (${room.hotel_area})` : ''}`,
      `Room: ${booking.roomType} — ₦${Number(booking.roomPrice).toLocaleString('en-NG')}/night`,
      `Stay: ${booking.requestedCheckinDate} → ${booking.requestedCheckoutDate} (${nights} night${nights === 1 ? '' : 's'})`,
      `Est. total: ₦${estTotal.toLocaleString('en-NG')}`,
      `Guest: ${booking.studentName}`,
      `WhatsApp: ${booking.studentPhone}`,
      '',
      'I am ready to transfer as instructed. Please confirm payment and share the exact address.',
    ].join('\n');
    booking.whatsappUrl = `https://wa.me/${booking.coordinatorWa}?text=${encodeURIComponent(booking.coordinatorWaMessage)}`;
    return booking;
  });
}

export async function updateHotelBookingStatus(id, status) {
  if (!BOOKING_STATUSES.includes(status)) {
    throw new AppError('Invalid booking status', 400, 'INVALID_STATUS');
  }
  await expireOverdueBookings();

  const { rows: existing } = await query(
    `SELECT b.*, h.name AS hotel_name, h.manager_phone, r.room_type, r.price AS room_price
     FROM hotel_bookings b
     JOIN hotels h ON h.id = b.hotel_id
     JOIN hotel_rooms r ON r.id = b.room_id
     WHERE b.id = $1`,
    [id]
  );
  if (!existing[0]) throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  if (existing[0].status === 'expired' && status !== 'cancelled') {
    throw new AppError('This booking has expired', 400, 'BOOKING_EXPIRED');
  }

  const { rows } = await query(
    `UPDATE hotel_bookings SET status = $2 WHERE id = $1
     RETURNING *`,
    [id, status]
  );
  const row = {
    ...rows[0],
    hotel_name: existing[0].hotel_name,
    manager_phone: existing[0].manager_phone,
    room_type: existing[0].room_type,
    room_price: existing[0].room_price,
  };
  const booking = bookingToClient(row, { includeStudentPhone: true });

  if (status === 'payment_confirmed' || status === 'hotel_contacted') {
    booking.contactHotelMessage = [
      `KeffiRooms HotelSpace reservation request`,
      `Code: ${booking.bookingCode}`,
      `Room: ${booking.roomType}`,
      `Check-in: ${booking.requestedCheckinDate}`,
      `Check-out: ${booking.requestedCheckoutDate}`,
      `Guest name: ${booking.studentName}`,
      '',
      'Please confirm if this room is available. Reply YES or NO.',
    ].join('\n');
    if (booking.managerWa) {
      booking.contactHotelWhatsappUrl = `https://wa.me/${booking.managerWa}?text=${encodeURIComponent(booking.contactHotelMessage)}`;
    }
  }

  return booking;
}

export async function listPendingHotelOwners() {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.created_at,
            hop.status, hop.hotel_name, hop.verification_notes,
            h.id AS hotel_id, h.location_address, h.area, h.landmark,
            h.price_range_min, h.price_range_max, h.description AS hotel_description,
            h.pin_lat, h.pin_lng, h.pin_acc
     FROM hotel_owner_profiles hop
     JOIN users u ON u.id = hop.user_id
     LEFT JOIN hotels h ON h.owner_id = u.id
     WHERE hop.status = 'pending'
     ORDER BY hop.created_at ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    hotelName: r.hotel_name,
    hotelId: r.hotel_id,
    locationAddress: r.location_address,
    area: r.area,
    landmark: r.landmark,
    pinLat: r.pin_lat != null ? Number(r.pin_lat) : null,
    pinLng: r.pin_lng != null ? Number(r.pin_lng) : null,
    pinAcc: r.pin_acc,
    priceRangeMin: r.price_range_min,
    priceRangeMax: r.price_range_max,
    description: r.hotel_description,
    createdAt: r.created_at,
    wa: toWhatsAppIntl(r.phone),
    mapUrl: r.pin_lat != null && r.pin_lng != null
      ? `https://www.google.com/maps?q=${r.pin_lat},${r.pin_lng}`
      : null,
  }));
}

export async function setHotelOwnerStatus(userId, status, adminId) {
  if (!['approved', 'denied', 'pending'].includes(status)) {
    throw new AppError('Invalid status', 400, 'INVALID_STATUS');
  }
  const { rows } = await query(
    `UPDATE hotel_owner_profiles SET
       status = $2::hotel_owner_status,
       approved_at = CASE WHEN $2::text = 'approved' THEN NOW() ELSE approved_at END,
       approved_by = CASE WHEN $2::text = 'approved' THEN $3::uuid ELSE approved_by END
     WHERE user_id = $1
     RETURNING *`,
    [userId, status, adminId]
  );
  if (!rows[0]) throw new AppError('Hotel owner not found', 404, 'NOT_FOUND');

  if (status === 'approved') {
    await query(
      `UPDATE hotels SET
         verify_status = 'verified',
         is_active = TRUE
       WHERE owner_id = $1`,
      [userId]
    );
  } else if (status === 'denied') {
    await query(
      `UPDATE hotels SET
         verify_status = 'rejected',
         is_active = FALSE
       WHERE owner_id = $1`,
      [userId]
    );
  }

  return rows[0];
}

export async function assertHotelOwnedBy(hotelId, ownerId) {
  const { rows } = await query(`SELECT id, owner_id FROM hotels WHERE id = $1`, [hotelId]);
  if (!rows[0]) throw new AppError('Hotel not found', 404, 'HOTEL_NOT_FOUND');
  if (rows[0].owner_id !== ownerId) {
    throw new AppError('Not your hotel', 403, 'FORBIDDEN');
  }
  return rows[0];
}

export { BOOKING_STATUSES };
